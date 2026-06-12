/**
 * Unit tests for the `initiateCheckout` orchestration (and the `getReservation`
 * polling read). No Postgres: a stateful fake prisma emulates just enough of
 * the reserve/confirm/release surface — including reserve's raw conditional
 * UPDATE, whose grant is computed from a configurable availability map — plus a
 * recording fake `PaymentGateway` (ADR 0010).
 */
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import { initiateCheckout } from './initiate';
import { getReservation } from './reservations';
import type { CreatePaymentIntentInput, PaymentGateway } from './payments';
import { NotFoundError } from './_shared/errors';

const PAST = new Date(Date.now() - 86_400_000);
const FUTURE = new Date(Date.now() + 86_400_000);

type Row = Record<string, unknown> & { id: string };

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'tt-1',
    name: 'General Admission',
    description: 'GA',
    maxPurchasePerUser: 10,
    ticketingFees: 'PASS_TICKET_FEES',
    ticketType: 'PAID',
    capacity: 100,
    reserved: 0,
    sold: 0,
    priceCents: 5000,
    saleStartsAt: PAST,
    saleEndsAt: FUTURE,
    quantity: 100,
    price: 50,
    saleStartDate: PAST,
    saleEndDate: FUTURE,
    discountCode: null,
    event: { isDraft: false },
    ...overrides,
  };
}

interface FakeState {
  reservations: Map<string, any>;
  orders: any[];
  outbox: any[];
}

/**
 * Stateful PrismaClient stand-in. `availability` drives the grant computed by
 * reserve's raw UPDATE (keyed by ticket-type id, decremented as granted).
 */
function fakeDb(opts: { rows?: Row[]; availability?: Record<string, number> }) {
  const availability = { ...(opts.availability ?? {}) };
  const state: FakeState = { reservations: new Map(), orders: [], outbox: [] };

  const reservationFind = async ({ where, ...rest }: any) => {
    void rest;
    if (where.id) return state.reservations.get(where.id) ?? null;
    if (where.stripePaymentIntentId) {
      return (
        [...state.reservations.values()].find(
          (r) => r.stripePaymentIntentId === where.stripePaymentIntentId
        ) ?? null
      );
    }
    return null;
  };

  const tx = {
    // reserve's conditional UPDATE: values are [ticketTypeId, requested, requested].
    $queryRaw: async (sql: { values: unknown[] }) => {
      const ticketTypeId = sql.values[0] as string;
      const requested = sql.values[1] as number;
      const avail = availability[ticketTypeId] ?? 0;
      const granted = Math.min(requested, Math.max(0, avail));
      availability[ticketTypeId] = avail - granted;
      return [{ granted }];
    },
    reservation: {
      create: async ({ data }: any) => {
        state.reservations.set(data.id, {
          ...data,
          eventId: data.event.connect.id,
          userId: data.user?.connect?.id ?? null,
          orderId: null,
          stripePaymentIntentId: null,
          items: data.items.createMany.data,
        });
      },
      update: async ({ where, data }: any) => {
        const r = state.reservations.get(where.id);
        Object.assign(r, data);
        return r;
      },
      findUnique: reservationFind,
    },
    ticketTypes: { update: async () => ({}) },
    orders: {
      create: async ({ data }: any) => {
        state.orders.push(data);
        return data;
      },
    },
    outboxMessage: {
      create: async ({ data }: any) => {
        state.outbox.push(data);
        return data;
      },
    },
  };

  const prisma = {
    ...tx,
    ticketTypes: {
      ...tx.ticketTypes,
      findMany: async () => opts.rows ?? [],
    },
    $transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
  } as unknown as PrismaClient;

  return { prisma, state };
}

function fakeGateway(behavior: 'ok' | 'fail' = 'ok') {
  const calls: CreatePaymentIntentInput[] = [];
  const gateway: PaymentGateway = {
    async createPaymentIntent(input) {
      calls.push(input);
      if (behavior === 'fail') throw new Error('stripe is down');
      return { paymentIntentId: 'pi_123', clientSecret: 'pi_123_secret' };
    },
  };
  return { gateway, calls };
}

const CONTACT = { email: 'b@x.com', firstName: 'Bea', lastName: 'Buyer' };

function initiate(
  db: ReturnType<typeof fakeDb>,
  gw: PaymentGateway,
  items: { ticketTypeId: string; quantity: number }[],
  extra: { code?: string; userId?: string | null } = {}
) {
  return initiateCheckout(
    db.prisma,
    gw,
    { eventId: 'evt-1', items, contact: CONTACT, code: extra.code },
    { userId: extra.userId }
  );
}

describe('initiateCheckout', () => {
  it('reserves, mints a PaymentIntent, and attaches it (happy paid path)', async () => {
    const db = fakeDb({ rows: [row()], availability: { 'tt-1': 100 } });
    const { gateway, calls } = fakeGateway();

    const res = await initiate(db, gateway, [
      { ticketTypeId: 'tt-1', quantity: 2 },
    ]);

    // 2 × (5000 + fee 450) — fee literal so a formula bug can't pass both sides.
    expect(res).toMatchObject({
      isValid: true,
      wasAdjusted: false,
      isFree: false,
      subtotalCents: 10000,
      feesCents: 900,
      totalCents: 10900,
      clientSecret: 'pi_123_secret',
      message: 'Tickets are available',
    });
    expect(res.reservationId).toBeTruthy();
    expect(res.expiresAt).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      amountCents: 10900,
      reservationId: res.reservationId,
      eventId: 'evt-1',
      email: CONTACT.email,
    });
    const reservation = db.state.reservations.get(res.reservationId!);
    expect(reservation.stripePaymentIntentId).toBe('pi_123');
    expect(reservation.status).toBe('HELD');
  });

  it('clamps to maxPurchasePerUser and reports the adjustment', async () => {
    const db = fakeDb({
      rows: [row({ maxPurchasePerUser: 3 })],
      availability: { 'tt-1': 100 },
    });
    const res = await initiate(db, fakeGateway().gateway, [
      { ticketTypeId: 'tt-1', quantity: 5 },
    ]);

    expect(res.isValid).toBe(true);
    expect(res.wasAdjusted).toBe(true);
    expect(res.validatedItems[0]).toMatchObject({
      requestedQuantity: 5,
      validatedQuantity: 3,
      message: 'Quantity Reduced: Max Available',
    });
    expect(res.message).toBe(
      'Some tickets were unavailable or sold out and cart was adjusted'
    );
  });

  it('clamps to live availability via reserve (partial grant)', async () => {
    const db = fakeDb({ rows: [row()], availability: { 'tt-1': 1 } });
    const res = await initiate(db, fakeGateway().gateway, [
      { ticketTypeId: 'tt-1', quantity: 4 },
    ]);

    expect(res.validatedItems[0]).toMatchObject({
      validatedQuantity: 1,
      message: 'Quantity Reduced: Max Available',
    });
    expect(res.totalCents).toBe(5450); // 1 × (5000 + 450)
  });

  it('releases the empty hold and fails when everything is sold out', async () => {
    const db = fakeDb({ rows: [row()], availability: { 'tt-1': 0 } });
    const { gateway, calls } = fakeGateway();
    const res = await initiate(db, gateway, [
      { ticketTypeId: 'tt-1', quantity: 2 },
    ]);

    expect(res).toMatchObject({
      isValid: false,
      reservationId: null,
      clientSecret: null,
      totalCents: 0,
      message: 'All tickets are unavailable',
    });
    expect(res.validatedItems[0].message).toBe('Sold Out');
    expect(calls).toHaveLength(0);
    // The zero-grant hold was tidied up, not left HELD.
    const [reservation] = [...db.state.reservations.values()];
    expect(reservation.status).toBe('RELEASED');
  });

  it('confirms free orders synchronously — no gateway, order + outbox written', async () => {
    const db = fakeDb({
      rows: [
        row({ priceCents: 0, price: 0, ticketingFees: 'ABSORB_TICKET_FEES' }),
      ],
      availability: { 'tt-1': 50 },
    });
    const { gateway, calls } = fakeGateway();
    const res = await initiate(db, gateway, [
      { ticketTypeId: 'tt-1', quantity: 2 },
    ]);

    expect(res).toMatchObject({
      isValid: true,
      isFree: true,
      clientSecret: null,
    });
    expect(calls).toHaveLength(0);
    expect(db.state.orders).toHaveLength(1);
    expect(db.state.outbox).toHaveLength(1);
    const reservation = db.state.reservations.get(res.reservationId!);
    expect(reservation.status).toBe('CONVERTED');
  });

  it('hides code-gated tickets without the code; unlocks with it', async () => {
    const gated = row({ id: 'tt-vip', name: 'VIP', discountCode: 'SECRET' });

    const noCode = fakeDb({ rows: [gated], availability: { 'tt-vip': 10 } });
    const denied = await initiate(noCode, fakeGateway().gateway, [
      { ticketTypeId: 'tt-vip', quantity: 1 },
    ]);
    expect(denied.isValid).toBe(false);
    expect(denied.validatedItems[0].message).toBe('Ticket Type Not Found');

    const withCode = fakeDb({ rows: [gated], availability: { 'tt-vip': 10 } });
    const granted = await initiate(
      withCode,
      fakeGateway().gateway,
      [{ ticketTypeId: 'tt-vip', quantity: 1 }],
      { code: 'secret' } // case-insensitive
    );
    expect(granted.isValid).toBe(true);
    expect(granted.promotionApplied).toBe('secret');
  });

  it('rejects outside the sale window without reserving', async () => {
    const db = fakeDb({
      rows: [row({ saleStartsAt: FUTURE, saleStartDate: FUTURE })],
      availability: { 'tt-1': 100 },
    });
    const res = await initiate(db, fakeGateway().gateway, [
      { ticketTypeId: 'tt-1', quantity: 1 },
    ]);
    expect(res.isValid).toBe(false);
    expect(res.validatedItems[0].message).toBe('Sale Not Started');
    expect(db.state.reservations.size).toBe(0);
  });

  it('treats draft events and unknown ticket types as not found', async () => {
    const db = fakeDb({
      rows: [row({ event: { isDraft: true } })],
      availability: { 'tt-1': 100 },
    });
    const res = await initiate(db, fakeGateway().gateway, [
      { ticketTypeId: 'tt-1', quantity: 1 },
      { ticketTypeId: 'tt-ghost', quantity: 1 },
    ]);
    expect(res.isValid).toBe(false);
    for (const item of res.validatedItems) {
      expect(item.message).toBe('Ticket Type Not Found');
    }
  });

  it('releases the hold when the payment gateway fails', async () => {
    const db = fakeDb({ rows: [row()], availability: { 'tt-1': 100 } });
    const { gateway } = fakeGateway('fail');

    await expect(
      initiate(db, gateway, [{ ticketTypeId: 'tt-1', quantity: 1 }])
    ).rejects.toThrow('stripe is down');

    const [reservation] = [...db.state.reservations.values()];
    expect(reservation.status).toBe('RELEASED');
  });

  it('merges duplicate ticket types into one reserved line', async () => {
    const db = fakeDb({ rows: [row()], availability: { 'tt-1': 100 } });
    const res = await initiate(db, fakeGateway().gateway, [
      { ticketTypeId: 'tt-1', quantity: 1 },
      { ticketTypeId: 'tt-1', quantity: 2 },
    ]);
    expect(res.validatedItems).toHaveLength(1);
    expect(res.validatedItems[0]).toMatchObject({
      requestedQuantity: 3,
      validatedQuantity: 3,
    });
  });

  it('passes the signed-in user id through to the reservation', async () => {
    const db = fakeDb({ rows: [row()], availability: { 'tt-1': 100 } });
    const res = await initiate(
      db,
      fakeGateway().gateway,
      [{ ticketTypeId: 'tt-1', quantity: 1 }],
      { userId: 'user-7' }
    );
    const reservation = db.state.reservations.get(res.reservationId!);
    expect(reservation.userId).toBe('user-7');
  });
});

describe('getReservation', () => {
  function dbWith(reservation: object | null) {
    return {
      reservation: { findUnique: async () => reservation },
    } as unknown as PrismaClient;
  }

  it('maps the polling read (Date → ISO string)', async () => {
    const expiresAt = new Date('2026-06-12T12:00:00.000Z');
    const res = await getReservation(
      dbWith({ id: 'r-1', status: 'CONVERTED', orderId: 'o-1', expiresAt }),
      'r-1'
    );
    expect(res).toEqual({
      reservationId: 'r-1',
      status: 'CONVERTED',
      orderId: 'o-1',
      expiresAt: '2026-06-12T12:00:00.000Z',
    });
  });

  it('throws NotFoundError for an unknown id', async () => {
    await expect(getReservation(dbWith(null), 'nope')).rejects.toThrow(
      NotFoundError
    );
  });
});
