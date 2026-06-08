/**
 * Integration tests for the reservation primitives. These hit a REAL Postgres
 * (the locking/atomicity behavior is not mockable), so point your env at the
 * dev or a preview branch before running: `yarn test reservations`.
 *
 * Each test provisions its own ticket type and everything is cleaned up by event
 * id in afterAll.
 *
 * @jest-environment node
 */
import prisma from '@/server/prisma';
import {
  OrderStatus,
  ReservationStatus,
  TicketStatus,
} from '@/generated/prisma/client';
import { generateId } from '@/lib/utils';
import { confirm, expire, release, reserve } from './reservations';

// Integration tests hit a real DB; the default 5s is too tight.
jest.setTimeout(30_000);

const TEST_EVENT_ID = `test-evt-${generateId()}`;
const createdOrderIds: string[] = [];

beforeAll(async () => {
  await prisma.events.create({
    data: {
      id: TEST_EVENT_ID,
      isDraft: false,
      name: 'Reservation Test Event',
      description: 'Fixture for reservations.test.ts',
      organizer: 'Test Org',
      organizerUserId: 'test-organizer',
      startDate: new Date(),
      endDate: new Date(Date.now() + 86_400_000),
      address: '123 Test St',
    },
  });
});

afterAll(async () => {
  // FK-safe teardown, scoped to the test event.
  if (createdOrderIds.length > 0) {
    await prisma.outboxMessage.deleteMany({
      where: {
        OR: createdOrderIds.map((id) => ({
          payload: { path: ['orderId'], equals: id },
        })),
      },
    });
  }
  await prisma.tickets.deleteMany({ where: { eventId: TEST_EVENT_ID } });
  await prisma.orders.deleteMany({ where: { eventId: TEST_EVENT_ID } });
  await prisma.reservation.deleteMany({ where: { eventId: TEST_EVENT_ID } }); // items cascade
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
      quantity: capacity,
      capacity,
      price: priceCents / 100,
      priceCents,
      saleStartDate: new Date(Date.now() - 86_400_000),
      saleEndDate: new Date(Date.now() + 86_400_000),
      event: { connect: { id: TEST_EVENT_ID } },
    },
  });
}

describe('reserve — concurrency (the headline guarantee)', () => {
  it('grants the last ticket exactly once under concurrent load', async () => {
    const tt = await makeTicketType(1);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        reserve({
          eventId: TEST_EVENT_ID,
          items: [
            {
              ticketTypeId: tt.id,
              quantity: 1,
              unitPriceCents: 1000,
              feesCents: 0,
            },
          ],
        })
      )
    );

    const totalGranted = results.reduce(
      (sum, r) => sum + r.items[0].granted,
      0
    );
    expect(totalGranted).toBe(1);
    expect(results.filter((r) => r.granted).length).toBe(1);

    const after = await prisma.ticketTypes.findUnique({ where: { id: tt.id } });
    expect(after?.reserved).toBe(1);
    expect(after?.reserved).toBeLessThanOrEqual(after?.capacity ?? 0);
  });
});

describe('reserve — clamp to available (wasAdjusted UX)', () => {
  it('grants min(requested, available) and reports the reduction', async () => {
    const tt = await makeTicketType(5);

    const result = await reserve({
      eventId: TEST_EVENT_ID,
      items: [
        {
          ticketTypeId: tt.id,
          quantity: 8,
          unitPriceCents: 1000,
          feesCents: 200,
        },
      ],
    });

    expect(result.items[0].requested).toBe(8);
    expect(result.items[0].granted).toBe(5);
    expect(result.subtotalCents).toBe(5 * 1000);
    expect(result.feesCents).toBe(5 * 200);
    expect(result.totalCents).toBe(5 * 1200);

    const after = await prisma.ticketTypes.findUnique({ where: { id: tt.id } });
    expect(after?.reserved).toBe(5);
  });
});

describe('confirm — atomic + idempotent', () => {
  it('moves reserved→sold once and is a no-op on duplicate delivery', async () => {
    const tt = await makeTicketType(5);
    const r = await reserve({
      eventId: TEST_EVENT_ID,
      items: [
        {
          ticketTypeId: tt.id,
          quantity: 2,
          unitPriceCents: 1500,
          feesCents: 300,
        },
      ],
      contact: {
        email: 'buyer@example.com',
        firstName: 'Bud',
        lastName: 'Buyer',
      },
    });

    // The route assigns the PaymentIntent id after creating the intent.
    const paymentIntentId = `pi_test_${generateId()}`;
    await prisma.reservation.update({
      where: { id: r.reservationId },
      data: { stripePaymentIntentId: paymentIntentId },
    });

    const first = await confirm({
      paymentIntentId,
      cardType: 'visa',
      cardLast4: '4242',
    });
    createdOrderIds.push(first.orderId);
    expect(first.alreadyProcessed).toBe(false);

    const second = await confirm({ paymentIntentId });
    expect(second.alreadyProcessed).toBe(true);
    expect(second.orderId).toBe(first.orderId);

    const ttAfter = await prisma.ticketTypes.findUnique({
      where: { id: tt.id },
    });
    expect(ttAfter?.sold).toBe(2); // incremented once, not twice
    expect(ttAfter?.reserved).toBe(0);

    const orders = await prisma.orders.findMany({
      where: { stripePaymentId: paymentIntentId },
      include: { tickets: true },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe(OrderStatus.COMPLETED);
    expect(orders[0].tickets).toHaveLength(2);
    expect(
      orders[0].tickets.every((t) => t.status === TicketStatus.VALID)
    ).toBe(true);

    const resAfter = await prisma.reservation.findUnique({
      where: { id: r.reservationId },
    });
    expect(resAfter?.status).toBe(ReservationStatus.CONVERTED);
    expect(resAfter?.orderId).toBe(first.orderId);
  });
});

describe('release', () => {
  it('hands held inventory back and marks the reservation RELEASED', async () => {
    const tt = await makeTicketType(3);
    const r = await reserve({
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
    expect(
      (await prisma.ticketTypes.findUnique({ where: { id: tt.id } }))?.reserved
    ).toBe(2);

    const didRelease = await release(r.reservationId);
    expect(didRelease).toBe(true);
    expect(
      (await prisma.ticketTypes.findUnique({ where: { id: tt.id } }))?.reserved
    ).toBe(0);
    expect(
      (await prisma.reservation.findUnique({ where: { id: r.reservationId } }))
        ?.status
    ).toBe(ReservationStatus.RELEASED);

    // idempotent: releasing again is a no-op
    expect(await release(r.reservationId)).toBe(false);
  });
});

describe('expire', () => {
  it('releases inventory held by reservations past their TTL', async () => {
    const tt = await makeTicketType(4);
    const r = await reserve({
      eventId: TEST_EVENT_ID,
      items: [
        {
          ticketTypeId: tt.id,
          quantity: 3,
          unitPriceCents: 1000,
          feesCents: 0,
        },
      ],
      ttlMinutes: -1, // already expired
    });
    expect(
      (await prisma.ticketTypes.findUnique({ where: { id: tt.id } }))?.reserved
    ).toBe(3);

    const count = await expire(new Date());
    expect(count).toBeGreaterThanOrEqual(1);

    expect(
      (await prisma.ticketTypes.findUnique({ where: { id: tt.id } }))?.reserved
    ).toBe(0);
    expect(
      (await prisma.reservation.findUnique({ where: { id: r.reservationId } }))
        ?.status
    ).toBe(ReservationStatus.EXPIRED);
  });
});
