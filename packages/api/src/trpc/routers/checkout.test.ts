import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import { createCaller } from './index';
import { createContext } from '../context';

const PAST = new Date(Date.now() - 86_400_000);
const FUTURE = new Date(Date.now() + 86_400_000);

const vipRow = {
  id: 'tt-1',
  name: 'VIP',
  description: 'VIP entry',
  maxPurchasePerUser: 10,
  ticketingFees: 'PASS_TICKET_FEES',
  capacity: 100,
  reserved: 0,
  sold: 0,
  priceCents: 5000,
  price: 50,
  saleStartsAt: PAST,
  saleEndsAt: FUTURE,
  event: { isDraft: false },
};

function fakePrisma(rows: unknown[]): PrismaClient {
  return {
    ticketTypes: { findMany: async () => rows },
  } as unknown as PrismaClient;
}

function caller(prisma: PrismaClient) {
  return createCaller(createContext({ prisma }));
}

describe('appRouter.checkout (via createCaller)', () => {
  it('applyCode returns the unlocked ticket types', async () => {
    const res = await caller(fakePrisma([vipRow])).checkout.applyCode({
      eventId: 'evt-1',
      code: 'vip',
    });
    expect(res).toMatchObject({
      type: 'unlocked',
      tickets: [{ id: 'tt-1', priceCents: 5000 }],
    });
  });

  it('applyCode returns invalid for a non-matching code', async () => {
    const res = await caller(fakePrisma([])).checkout.applyCode({
      eventId: 'evt-1',
      code: 'NOPE',
    });
    expect(res).toEqual({ type: 'invalid' });
  });

  it('rejects invalid input at the boundary (empty eventId)', async () => {
    await expect(
      caller(fakePrisma([])).checkout.applyCode({ eventId: '', code: 'X' })
    ).rejects.toThrow();
  });
});
