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

type Grant = {
  id: string;
  maxUses: number | null;
  usedCount: number;
  quantity: number | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  holderEmail: string | null;
};

function fakePrisma(
  rows: Row[],
  grant: Partial<Grant> | null = {},
  heldCount = 0
) {
  const findUnique = vi.fn(async (_args: unknown) =>
    grant === null
      ? null
      : {
          id: 'g-1',
          maxUses: null,
          usedCount: 0,
          quantity: null,
          expiresAt: null,
          revokedAt: null,
          holderEmail: null,
          ...grant,
          ticketTypes: rows.map((ticketType) => ({ ticketType })),
        }
  );
  const count = vi.fn(async () => heldCount);
  return {
    prisma: {
      grant: { findUnique },
      reservation: { count },
    } as unknown as PrismaClient,
    findUnique,
    count,
  };
}

describe('applyCode', () => {
  it('looks the code up trimmed and uppercased, by exact match', async () => {
    const { prisma, findUnique } = fakePrisma([row()]);
    await applyCode(prisma, { eventId: 'evt-1', code: '  vipList ' });

    expect(findUnique.mock.calls[0][0]).toMatchObject({
      where: { eventId_code: { eventId: 'evt-1', code: 'VIPLIST' } },
    });
  });

  it('returns every ticket type the grant lists, in event-page shape and order', async () => {
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
    expect(res.quantity).toBeNull();
    expect(res.holderEmail).toBeNull();
    expect(res.kind).toBe('unlimited');
  });

  it('lets the grant quantity replace the per-type cap, clamped by availability', async () => {
    const res = await applyCode(
      fakePrisma(
        [
          row({ id: 'wide', maxPurchasePerUser: 4 }),
          row({ id: 'tight', capacity: 3, priceCents: 9000 }),
        ],
        { quantity: 10, holderEmail: 'guest@example.com' }
      ).prisma,
      { eventId: 'evt-1', code: 'VIP' }
    );
    if (res.type !== 'unlocked') throw new Error('expected an unlock');
    expect(res.tickets.map((t) => [t.id, t.maxAllowedToAdd])).toEqual([
      ['wide', 10],
      ['tight', 3],
    ]);
    expect(res.quantity).toBe(10);
    expect(res.holderEmail).toBe('guest@example.com');
    expect(res.kind).toBe('invitation');
  });

  it('refuses a revoked grant, even an unused one, as unavailable', async () => {
    const res = await applyCode(
      fakePrisma([row()], { revokedAt: PAST, expiresAt: PAST }).prisma,
      { eventId: 'evt-1', code: 'VIP' }
    );
    expect(res).toEqual({ type: 'unavailable' });
  });

  it('refuses an expired grant with its expiry', async () => {
    const res = await applyCode(
      fakePrisma([row()], { expiresAt: PAST }).prisma,
      { eventId: 'evt-1', code: 'VIP' }
    );
    expect(res).toEqual({ type: 'expired', expiresAt: PAST.toISOString() });
  });

  it('reads an exhausted grant as in use while a hold is open on it', async () => {
    const exhausted = { maxUses: 1, usedCount: 1 };
    const inUse = await applyCode(fakePrisma([row()], exhausted, 1).prisma, {
      eventId: 'evt-1',
      code: 'VIP',
    });
    const used = await applyCode(fakePrisma([row()], exhausted, 0).prisma, {
      eventId: 'evt-1',
      code: 'VIP',
    });
    expect(inUse).toEqual({ type: 'inUse' });
    expect(used).toEqual({ type: 'unavailable' });
  });

  it('unlocks a grant with uses left without counting holds', async () => {
    const { prisma, count } = fakePrisma([row()], {
      maxUses: 2,
      usedCount: 1,
      expiresAt: FUTURE,
    });
    const res = await applyCode(prisma, { eventId: 'evt-1', code: 'VIP' });
    expect(res.type).toBe('unlocked');
    expect(count).not.toHaveBeenCalled();
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

  it('is invalid when no grant has the code, or it lists no ticket type', async () => {
    for (const fake of [fakePrisma([row()], null), fakePrisma([])]) {
      expect(
        await applyCode(fake.prisma, { eventId: 'evt-1', code: 'NOPE' })
      ).toEqual({ type: 'invalid' });
    }
  });

  it('is invalid for a blank code without touching the database', async () => {
    const { prisma, findUnique } = fakePrisma([row()]);
    expect(await applyCode(prisma, { eventId: 'evt-1', code: '   ' })).toEqual({
      type: 'invalid',
    });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
