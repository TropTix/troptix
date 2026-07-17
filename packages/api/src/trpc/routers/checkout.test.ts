/**
 * Tests the tRPC checkout router through `createCaller` (no HTTP) with an
 * injected fake `prisma` — proving the adapter wiring: zod input validation at
 * the boundary, the service call, and the output shape. The service logic
 * itself is covered by services/checkout.test.ts.
 */
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import { createCaller } from './index';
import { createContext } from '../context';

const PAST = new Date(Date.now() - 86_400_000);
const FUTURE = new Date(Date.now() + 86_400_000);

const gaRow = {
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
  quantity: 100,
  price: 50,
  saleStartsAt: PAST,
  saleEndsAt: FUTURE,
  event: { isDraft: false },
};

function fakePrisma(opts: {
  ticketTypes?: unknown[];
  matched?: unknown;
}): PrismaClient {
  return {
    ticketTypes: {
      findMany: async () => opts.ticketTypes ?? [],
      findFirst: async () => opts.matched ?? null,
    },
    events: { count: async () => 1 },
  } as unknown as PrismaClient;
}

function caller(prisma: PrismaClient) {
  return createCaller(createContext({ prisma }));
}

describe('appRouter.checkout (via createCaller)', () => {
  it('config returns the mapped ticket list', async () => {
    const res = await caller(
      fakePrisma({ ticketTypes: [gaRow] })
    ).checkout.config({ eventId: 'evt-1' });
    expect(res.tickets).toHaveLength(1);
    expect(res.tickets[0]).toMatchObject({ id: 'tt-1', priceCents: 5000 });
  });

  it('rejects invalid input at the boundary (empty eventId)', async () => {
    await expect(
      caller(fakePrisma({})).checkout.config({ eventId: '' })
    ).rejects.toThrow();
  });

  it('applyCode returns an invalid result for a non-matching code', async () => {
    const res = await caller(fakePrisma({ matched: null })).checkout.applyCode({
      eventId: 'evt-1',
      code: 'NOPE',
    });
    expect(res).toMatchObject({ type: 'invalid', isValid: false });
  });
});
