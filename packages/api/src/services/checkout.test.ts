import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import { applyCode } from './checkout';

const PAST = new Date(Date.now() - 86_400_000);
const FUTURE = new Date(Date.now() + 86_400_000);

type Row = {
  id: string;
  name: string;
  description: string;
  maxPurchasePerUser: number;
  ticketingFees: 'PASS_TICKET_FEES' | 'ABSORB_TICKET_FEES';
  capacity: number;
  reserved: number;
  sold: number;
  priceCents: number | null;
  price: number;
  saleStartsAt: Date;
  saleEndsAt: Date;
  event: { isDraft: boolean };
};

function row(overrides: Partial<Row> = {}): Row {
  return {
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
    ...overrides,
  };
}

function fakePrisma(rows: Row[]) {
  const findMany = vi.fn(async (_args: unknown) => rows);
  return {
    prisma: { ticketTypes: { findMany } } as unknown as PrismaClient,
    findMany,
  };
}

describe('applyCode', () => {
  it('looks the code up trimmed and uppercased, by exact match', async () => {
    const { prisma, findMany } = fakePrisma([row()]);
    await applyCode(prisma, { eventId: 'evt-1', code: '  vipList ' });

    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { eventId: 'evt-1', accessCode: 'VIPLIST' },
    });
  });

  it('returns every ticket type carrying the code, in event-page shape and order', async () => {
    const { prisma } = fakePrisma([
      row({ id: 'table', name: 'VIP Table', priceCents: 15000 }),
      row({ id: 'vip', priceCents: 5000 }),
      row({ id: 'gone', name: 'VIP Early', priceCents: 1000, capacity: 0 }),
    ]);
    const res = await applyCode(prisma, { eventId: 'evt-1', code: 'VIP' });

    expect(res.type).toBe('unlocked');
    if (res.type !== 'unlocked') return;
    expect(res.tickets.map((t) => t.id)).toEqual(['vip', 'table', 'gone']);
    expect(res.tickets[0]).toEqual({
      id: 'vip',
      name: 'VIP',
      description: 'VIP entry',
      priceCents: 5000,
      // 5000*0.08 + 50 = 450. Literal, not calculateFeesCents(5000), so a
      // wrong fee formula can't pass on both sides.
      feesCents: 450,
      maxAllowedToAdd: 10,
      saleStatus: 'onSale',
    });
    expect(res.tickets[2].saleStatus).toBe('soldOut');
  });

  it('zeroes the add limit on a draft event and outside the sale window', async () => {
    const draft = await applyCode(
      fakePrisma([row({ event: { isDraft: true } })]).prisma,
      { eventId: 'evt-1', code: 'VIP' }
    );
    const notYet = await applyCode(
      fakePrisma([row({ saleStartsAt: FUTURE, saleEndsAt: FUTURE })]).prisma,
      { eventId: 'evt-1', code: 'VIP' }
    );
    if (draft.type !== 'unlocked' || notYet.type !== 'unlocked') {
      throw new Error('expected both codes to unlock');
    }
    expect(draft.tickets[0]).toMatchObject({
      maxAllowedToAdd: 0,
      saleStatus: 'onSale',
    });
    expect(notYet.tickets[0]).toMatchObject({
      maxAllowedToAdd: 0,
      saleStatus: 'notYetOnSale',
    });
  });

  it('is invalid when no ticket type carries the code', async () => {
    const { prisma } = fakePrisma([]);
    expect(await applyCode(prisma, { eventId: 'evt-1', code: 'NOPE' })).toEqual(
      { type: 'invalid' }
    );
  });

  it('is invalid for a blank code without touching the database', async () => {
    const { prisma, findMany } = fakePrisma([row()]);
    expect(await applyCode(prisma, { eventId: 'evt-1', code: '   ' })).toEqual({
      type: 'invalid',
    });
    expect(findMany).not.toHaveBeenCalled();
  });
});
