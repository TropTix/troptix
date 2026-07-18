/**
 * Integration tests for the paid-checkout money-state transitions (ADR 0018).
 * These hit a REAL Postgres (the atomicity/idempotency behavior is the point, and
 * isn't mockable) with a FAKE Stripe (injected). Point your env at a preview /
 * dev branch — same setup as reservations.test.ts. Everything is cleaned up by
 * event id in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import prisma, { ReservationStatus } from '@troptix/db';
import { generateId } from './_shared/ids';
import { reserve, settle } from './reservations';
import {
  beginPayment,
  confirmPaid,
  getCheckoutState,
  sweepExpiredHolds,
} from './payments';

const TEST_EVENT_ID = `test-pay-${generateId()}`;

beforeAll(async () => {
  await prisma.events.create({
    data: {
      id: TEST_EVENT_ID,
      isDraft: false,
      name: 'Payments Test Event',
      description: 'Fixture for payments.test.ts',
      organizer: 'Test Org',
      organizerUserId: 'test-organizer',
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 86_400_000),
      address: '123 Test St',
    },
  });
});

afterAll(async () => {
  await prisma.tickets.deleteMany({ where: { eventId: TEST_EVENT_ID } });
  await prisma.orders.deleteMany({ where: { eventId: TEST_EVENT_ID } });
  await prisma.reservation.deleteMany({ where: { eventId: TEST_EVENT_ID } });
  await prisma.ticketTypes.deleteMany({ where: { eventId: TEST_EVENT_ID } });
  await prisma.events.delete({ where: { id: TEST_EVENT_ID } });
  await prisma.$disconnect();
});

async function makeTicketType(capacity: number, priceCents = 1000) {
  return prisma.ticketTypes.create({
    data: {
      id: generateId(),
      name: 'GA',
      description: 'General admission',
      maxPurchasePerUser: 10,
      capacity,
      price: priceCents / 100,
      priceCents,
      saleStartsAt: new Date(Date.now() - 86_400_000),
      saleEndsAt: new Date(Date.now() + 86_400_000),
      event: { connect: { id: TEST_EVENT_ID } },
    },
  });
}

/** Create a HELD paid reservation with `qty` units of one tier. */
async function heldPaidReservation(
  ticketTypeId: string,
  qty: number,
  unitPriceCents = 1000,
  feesCents = 200
) {
  const r = await reserve(prisma, {
    eventId: TEST_EVENT_ID,
    items: [{ ticketTypeId, quantity: qty, unitPriceCents, feesCents }],
    contact: {
      email: 'buyer@example.com',
      firstName: 'Bud',
      lastName: 'Buyer',
    },
  });
  return r.reservationId;
}

/** Mimic `expire()` for a single reservation without scanning the shared DB. */
async function forceExpire(reservationId: string) {
  const r = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { items: true },
  });
  if (!r) throw new Error('reservation missing');
  await prisma.$transaction(async (tx) => {
    for (const item of r.items) {
      await tx.ticketTypes.update({
        where: { id: item.ticketTypeId },
        data: { reserved: { decrement: item.quantity } },
      });
    }
    await tx.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.EXPIRED },
    });
  });
}

interface FakeSessionState {
  id: string;
  client_secret: string | null;
  status: 'open' | 'complete' | 'expired';
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  payment_intent: string | null;
}

/** Minimal fake Stripe; records calls and returns a controllable session. */
function fakeStripe(
  session?: Partial<FakeSessionState>,
  opts?: { expireThrows?: boolean }
) {
  const calls = {
    create: [] as Array<{ params: unknown; opts: unknown }>,
    retrieve: [] as string[],
    refund: [] as Array<{ params: unknown; opts: unknown }>,
    expire: [] as string[],
  };
  let current: FakeSessionState = {
    id: `cs_test_${generateId()}`,
    client_secret: `cs_secret_${generateId()}`,
    status: 'open',
    payment_status: 'unpaid',
    payment_intent: null,
    ...session,
  };
  const stripe = {
    checkout: {
      sessions: {
        create: async (params: unknown, opts: unknown) => {
          calls.create.push({ params, opts });
          return current;
        },
        retrieve: async (id: string) => {
          calls.retrieve.push(id);
          return current;
        },
        expire: async (id: string) => {
          calls.expire.push(id);
          // Stripe only expires an OPEN session; a paid one throws.
          if (opts?.expireThrows) throw new Error('Session already completed');
          return current;
        },
      },
    },
    refunds: {
      create: async (params: unknown, opts: unknown) => {
        calls.refund.push({ params, opts });
        return { id: `re_test_${generateId()}` };
      },
    },
  } as unknown as Stripe;
  return {
    stripe,
    calls,
    set: (next: Partial<FakeSessionState>) => {
      current = { ...current, ...next };
    },
  };
}

/** Create an already-expired (past-TTL) HELD reservation, optionally with a Session id. */
async function expiredHold(
  ticketTypeId: string,
  qty: number,
  sessionId?: string
) {
  const r = await reserve(prisma, {
    eventId: TEST_EVENT_ID,
    items: [
      { ticketTypeId, quantity: qty, unitPriceCents: 1000, feesCents: 0 },
    ],
    ttlMinutes: -1, // already past TTL
  });
  if (sessionId) {
    await prisma.reservation.update({
      where: { id: r.reservationId },
      data: { stripeCheckoutSessionId: sessionId },
    });
  }
  return r.reservationId;
}

describe('settle — HELD path (fulfillment)', () => {
  it('materializes the order once and is idempotent on redelivery', async () => {
    const tt = await makeTicketType(5);
    const reservationId = await heldPaidReservation(tt.id, 2);
    const pi = `pi_test_${generateId()}`;

    const first = await settle(prisma, {
      reservationId,
      paymentIntentId: pi,
    });
    expect(first.kind).toBe('converted');
    if (first.kind !== 'converted') throw new Error('unreachable');
    expect(first.alreadyProcessed).toBe(false);

    // Duplicate webhook + poll: second call is a no-op returning the same order.
    const second = await settle(prisma, {
      reservationId,
      paymentIntentId: pi,
    });
    expect(second.kind).toBe('converted');
    if (second.kind !== 'converted') throw new Error('unreachable');
    expect(second.alreadyProcessed).toBe(true);
    expect(second.orderId).toBe(first.orderId);

    const tickets = await prisma.tickets.findMany({
      where: { orderId: first.orderId },
    });
    expect(tickets).toHaveLength(2);

    const after = await prisma.ticketTypes.findUnique({ where: { id: tt.id } });
    expect(after?.sold).toBe(2);
    expect(after?.reserved).toBe(0);

    const res = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    expect(res?.status).toBe(ReservationStatus.CONVERTED);
    expect(res?.stripePaymentIntentId).toBe(pi);
  });

  it('materializes exactly one order under concurrent settles (webhook + poll)', async () => {
    const tt = await makeTicketType(5);
    const reservationId = await heldPaidReservation(tt.id, 2);
    const pi = `pi_test_${generateId()}`;

    // The webhook and the sync-fulfillment poll can fire at the same instant.
    const [a, b] = await Promise.all([
      settle(prisma, { reservationId, paymentIntentId: pi }),
      settle(prisma, { reservationId, paymentIntentId: pi }),
    ]);

    expect(a.kind).toBe('converted');
    expect(b.kind).toBe('converted');
    if (a.kind !== 'converted' || b.kind !== 'converted') {
      throw new Error('unreachable');
    }
    // Same order; exactly one of the two did the real work.
    expect(a.orderId).toBe(b.orderId);
    expect([a.alreadyProcessed, b.alreadyProcessed].sort()).toEqual([
      false,
      true,
    ]);

    const orders = await prisma.orders.findMany({
      where: { eventId: TEST_EVENT_ID, stripePaymentId: pi },
    });
    expect(orders).toHaveLength(1);

    // No oversell / double count.
    const after = await prisma.ticketTypes.findUnique({ where: { id: tt.id } });
    expect(after?.sold).toBe(2);
    expect(after?.reserved).toBe(0);
  });
});

describe('settle — expiry race', () => {
  it('re-acquires the exact quantities when stock is available, then converts', async () => {
    const tt = await makeTicketType(2);
    const reservationId = await heldPaidReservation(tt.id, 2);
    await forceExpire(reservationId); // hold handed back; reserved → 0

    const result = await settle(prisma, {
      reservationId,
      paymentIntentId: `pi_test_${generateId()}`,
    });
    expect(result.kind).toBe('converted');

    const after = await prisma.ticketTypes.findUnique({ where: { id: tt.id } });
    expect(after?.sold).toBe(2);
    expect(after?.reserved).toBe(0);
  });

  it('signals needs_refund when stock is gone, without leaking reserved', async () => {
    const tt = await makeTicketType(2);
    const reservationId = await heldPaidReservation(tt.id, 2);
    await forceExpire(reservationId);

    // Someone else grabs the whole capacity while the buyer was paying.
    const competitor = await reserve(prisma, {
      eventId: TEST_EVENT_ID,
      items: [
        {
          ticketTypeId: tt.id,
          quantity: 2,
          unitPriceCents: 1000,
          feesCents: 0,
        },
      ],
    });
    expect(competitor.items[0].granted).toBe(2);

    const result = await settle(prisma, {
      reservationId,
      paymentIntentId: `pi_test_${generateId()}`,
    });
    expect(result.kind).toBe('needs_refund');

    // The rolled-back re-acquire must not have leaked any reserved units: only
    // the competitor's hold counts.
    const after = await prisma.ticketTypes.findUnique({ where: { id: tt.id } });
    expect(after?.reserved).toBe(2);
    expect(after?.sold).toBe(0);

    const res = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    expect(res?.status).toBe(ReservationStatus.EXPIRED);
  });
});

describe('confirmPaid — auto-refund on the expiry race', () => {
  it('refunds exactly once and is idempotent across webhook + poll', async () => {
    const tt = await makeTicketType(1);
    const reservationId = await heldPaidReservation(tt.id, 1);
    await forceExpire(reservationId);
    // Stock gone.
    await reserve(prisma, {
      eventId: TEST_EVENT_ID,
      items: [
        {
          ticketTypeId: tt.id,
          quantity: 1,
          unitPriceCents: 1000,
          feesCents: 0,
        },
      ],
    });

    const pi = `pi_test_${generateId()}`;
    const fake = fakeStripe();

    const first = await confirmPaid(prisma, fake.stripe, {
      reservationId,
      paymentIntentId: pi,
    });
    expect(first.kind).toBe('refunded');
    expect(fake.calls.refund).toHaveLength(1);
    expect(fake.calls.refund[0].opts).toMatchObject({
      idempotencyKey: `refund-${reservationId}`,
    });

    const res = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    expect(res?.status).toBe(ReservationStatus.REFUNDED);
    expect(res?.stripeRefundId).toBeTruthy();

    // Second delivery: already REFUNDED → no second refund call.
    const second = await confirmPaid(prisma, fake.stripe, {
      reservationId,
      paymentIntentId: pi,
    });
    expect(second.kind).toBe('refunded');
    expect(fake.calls.refund).toHaveLength(1);
  });
});

describe('beginPayment — session creation + reuse', () => {
  it('creates a Session once and reuses the open one on a second call', async () => {
    const tt = await makeTicketType(5);
    const reservationId = await heldPaidReservation(tt.id, 2, 1500, 300);
    const fake = fakeStripe();

    const first = await beginPayment(prisma, fake.stripe, {
      reservationId,
      baseUrl: 'https://example.test',
    });
    expect(first.clientSecret).toBeTruthy();
    expect(first.totalCents).toBe(2 * 1500 + 2 * 300);
    // Order summary (payment-screen), server-sourced from the reservation tiers.
    expect(first.subtotalCents).toBe(2 * 1500);
    expect(first.feesCents).toBe(2 * 300);
    expect(first.items).toEqual([
      { name: 'GA', quantity: 2, unitPriceCents: 1500, feesCents: 300 },
    ]);
    expect(fake.calls.create).toHaveLength(1);
    // Line items: a tier line + a single service-fee line.
    expect((fake.calls.create[0].params as any).line_items).toHaveLength(2);
    expect((fake.calls.create[0].params as any).ui_mode).toBe('elements');

    const res = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    expect(res?.stripeCheckoutSessionId).toBeTruthy();

    const second = await beginPayment(prisma, fake.stripe, {
      reservationId,
      baseUrl: 'https://example.test',
    });
    expect(second.clientSecret).toBe(first.clientSecret);
    // No second create — the open Session was retrieved and reused.
    expect(fake.calls.create).toHaveLength(1);
    expect(fake.calls.retrieve.length).toBeGreaterThanOrEqual(1);
  });

  it('refreshes the hold window at payment time', async () => {
    const tt = await makeTicketType(5);
    const reservationId = await heldPaidReservation(tt.id, 1);
    // Simulate a buyer who browsed a while: only ~2 min left on the hold.
    const nearly = new Date(Date.now() + 2 * 60_000);
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { expiresAt: nearly },
    });

    const fake = fakeStripe();
    const result = await beginPayment(prisma, fake.stripe, {
      reservationId,
      baseUrl: 'https://example.test',
    });

    // The returned + persisted deadline is pushed well past the near-expiry one.
    const returned = new Date(result.expiresAt).getTime();
    expect(returned).toBeGreaterThan(nearly.getTime() + 5 * 60_000);
    const res = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    expect(res?.expiresAt.getTime()).toBe(returned);
  });

  it('mints a fresh Session with a distinct key when the stored one is non-open', async () => {
    const tt = await makeTicketType(5);
    const reservationId = await heldPaidReservation(tt.id, 1);
    // A previous Session exists but has expired/completed at Stripe.
    const deadSessionId = `cs_dead_${generateId()}`;
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { stripeCheckoutSessionId: deadSessionId },
    });

    const fake = fakeStripe({ id: deadSessionId, status: 'expired' });
    await beginPayment(prisma, fake.stripe, {
      reservationId,
      baseUrl: 'https://example.test',
    });

    // It retrieved the dead session, then created a NEW one with a retry key —
    // not the fixed `checkout-<id>` key that would replay the dead session.
    expect(fake.calls.retrieve).toContain(deadSessionId);
    expect(fake.calls.create).toHaveLength(1);
    expect((fake.calls.create[0].opts as any).idempotencyKey).toBe(
      `checkout-${reservationId}-retry-${deadSessionId}`
    );
  });
});

describe('getCheckoutState', () => {
  it('reports held while the Session is unpaid', async () => {
    const tt = await makeTicketType(5);
    const reservationId = await heldPaidReservation(tt.id, 1);
    const fake = fakeStripe({ payment_status: 'unpaid' });
    // Attach a session id so getCheckoutState retrieves it.
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { stripeCheckoutSessionId: `cs_test_${generateId()}` },
    });

    const state = await getCheckoutState(prisma, fake.stripe, {
      reservationId,
    });
    expect(state.kind).toBe('held');
  });

  it('fulfills inline when the Session is paid but no order exists yet', async () => {
    const tt = await makeTicketType(5);
    const reservationId = await heldPaidReservation(tt.id, 1);
    const pi = `pi_test_${generateId()}`;
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { stripeCheckoutSessionId: `cs_test_${generateId()}` },
    });
    const fake = fakeStripe({ payment_status: 'paid', payment_intent: pi });

    const state = await getCheckoutState(prisma, fake.stripe, {
      reservationId,
    });
    expect(state.kind).toBe('order');
    if (state.kind !== 'order') throw new Error('unreachable');
    expect(state.tickets).toHaveLength(1);

    const res = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    expect(res?.status).toBe(ReservationStatus.CONVERTED);
  });

  it('reports expired for an expired hold with no payment', async () => {
    const tt = await makeTicketType(5);
    const reservationId = await heldPaidReservation(tt.id, 1);
    await forceExpire(reservationId);
    const fake = fakeStripe();

    const state = await getCheckoutState(prisma, fake.stripe, {
      reservationId,
    });
    expect(state.kind).toBe('expired');
  });
});

describe('sweepExpiredHolds — cancel-then-release', () => {
  it('expires the Session before releasing inventory', async () => {
    const tt = await makeTicketType(3);
    const sessionId = `cs_test_${generateId()}`;
    const reservationId = await expiredHold(tt.id, 3, sessionId);
    expect(
      (await prisma.ticketTypes.findUnique({ where: { id: tt.id } }))?.reserved
    ).toBe(3);

    const fake = fakeStripe();
    const result = await sweepExpiredHolds(prisma, fake.stripe, new Date());

    expect(fake.calls.expire).toContain(sessionId);
    expect(result.released).toBeGreaterThanOrEqual(1);

    const res = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    expect(res?.status).toBe(ReservationStatus.EXPIRED);
    expect(
      (await prisma.ticketTypes.findUnique({ where: { id: tt.id } }))?.reserved
    ).toBe(0);
  });

  it('keeps the hold when the Session cannot be expired (already paid)', async () => {
    const tt = await makeTicketType(3);
    const sessionId = `cs_test_${generateId()}`;
    const reservationId = await expiredHold(tt.id, 3, sessionId);

    // Session expire throws → the payment won; must NOT release inventory.
    const fake = fakeStripe(undefined, { expireThrows: true });
    const result = await sweepExpiredHolds(prisma, fake.stripe, new Date());

    expect(fake.calls.expire).toContain(sessionId);
    expect(result.keptLive).toBeGreaterThanOrEqual(1);

    const res = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    expect(res?.status).toBe(ReservationStatus.HELD);
    expect(
      (await prisma.ticketTypes.findUnique({ where: { id: tt.id } }))?.reserved
    ).toBe(3);

    // Terminalize so this still-HELD, past-TTL row doesn't leak into later sweeps.
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.EXPIRED },
    });
  });

  it('releases a Session-less hold with no Stripe call', async () => {
    const tt = await makeTicketType(2);
    const reservationId = await expiredHold(tt.id, 2);

    const fake = fakeStripe();
    await sweepExpiredHolds(prisma, fake.stripe, new Date());

    const res = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    expect(res?.status).toBe(ReservationStatus.EXPIRED);
    // No session on this hold → it was not passed to sessions.expire.
    expect(fake.calls.expire).not.toContain(reservationId);
  });
});
