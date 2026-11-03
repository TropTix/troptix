// Real Postgres via POSTGRES_PRISMA_URL (see reservations.test.ts) — point it
// at a preview/dev branch, never prod.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import prisma, { ReservationStatus } from '@troptix/db';
import type { CreateReservationResponse } from '../contracts/reservations';
import { generateId } from './_shared/ids';
import { writeLegacyAccessCode } from './_shared/access-code';
import { applyCode } from './checkout';
import { getEventDetail } from './events';
import {
  completeFree,
  createReservation,
  expireHold,
  release,
  settle,
} from './reservations';

const EVENT_ID = `test-grant-evt-${generateId()}`;
const OWNER_ID = `test-grant-owner-${generateId()}`;
const ORG_ID = `test-grant-org-${generateId()}`;
const DAY = 86_400_000;
const contact = {
  firstName: 'Gia',
  lastName: 'Guest',
  email: 'gia@example.com',
};

beforeAll(async () => {
  await prisma.users.create({
    data: { id: OWNER_ID, email: `${OWNER_ID}@troptix.test` },
  });
  await prisma.organization.create({
    data: {
      id: ORG_ID,
      slug: ORG_ID,
      displayName: 'Grant Org',
      ownerUserId: OWNER_ID,
    },
  });
  await prisma.events.create({
    data: {
      id: EVENT_ID,
      isDraft: false,
      name: 'Grant Test Event',
      description: 'Fixture for grants.test.ts',
      organizer: 'Grant Org',
      organizerUserId: OWNER_ID,
      organizationId: ORG_ID,
      startsAt: new Date(Date.now() + 10 * DAY),
      endsAt: new Date(Date.now() + 11 * DAY),
      address: '1 Grant St',
    },
  });
});

afterAll(async () => {
  await prisma.tickets.deleteMany({ where: { eventId: EVENT_ID } });
  await prisma.orders.deleteMany({ where: { eventId: EVENT_ID } });
  await prisma.reservation.deleteMany({ where: { eventId: EVENT_ID } });
  await prisma.grant.deleteMany({ where: { eventId: EVENT_ID } });
  await prisma.ticketTypes.deleteMany({ where: { eventId: EVENT_ID } });
  await prisma.events.delete({ where: { id: EVENT_ID } });
  await prisma.organization.delete({ where: { id: ORG_ID } });
  await prisma.users.delete({ where: { id: OWNER_ID } });
  await prisma.$disconnect();
});

async function ticketType(
  opts: {
    hidden?: boolean;
    capacity?: number;
    maxPerUser?: number;
    priceCents?: number;
  } = {}
) {
  return prisma.ticketTypes.create({
    data: {
      id: generateId(),
      name: 'Gala Seat',
      description: 'A seat',
      maxPurchasePerUser: opts.maxPerUser ?? 4,
      capacity: opts.capacity ?? 50,
      price: (opts.priceCents ?? 5000) / 100,
      priceCents: opts.priceCents ?? 5000,
      hidden: opts.hidden ?? true,
      saleStartsAt: new Date(Date.now() - DAY),
      saleEndsAt: new Date(Date.now() + 5 * DAY),
      eventId: EVENT_ID,
    },
  });
}

async function grant(
  ticketTypeIds: string[],
  fields: {
    maxUses?: number;
    quantity?: number;
    expiresAt?: Date;
    revokedAt?: Date;
  } = {}
) {
  return prisma.grant.create({
    data: {
      id: generateId(),
      eventId: EVENT_ID,
      code: `G${generateId()}`,
      ...fields,
      ticketTypes: {
        create: ticketTypeIds.map((ticketTypeId) => ({ ticketTypeId })),
      },
    },
  });
}

function hold(code: string, items: [string, number][]) {
  return createReservation(
    prisma,
    {
      eventId: EVENT_ID,
      accessCode: code,
      items: items.map(([ticketTypeId, quantity]) => ({
        ticketTypeId,
        quantity,
      })),
      contact,
    },
    null
  );
}

function held(res: CreateReservationResponse) {
  if (res.type !== 'held') throw new Error(`expected a hold, got ${res.type}`);
  return res;
}

async function usedCount(grantId: string) {
  return (await prisma.grant.findUniqueOrThrow({ where: { id: grantId } }))
    .usedCount;
}

async function reservedOf(ticketTypeId: string) {
  return (
    await prisma.ticketTypes.findUniqueOrThrow({ where: { id: ticketTypeId } })
  ).reserved;
}

describe('hold under a grant', () => {
  it('lets exactly one of many concurrent checkouts take a one-use grant', async () => {
    const tt = await ticketType();
    const g = await grant([tt.id], { maxUses: 1 });

    const results = await Promise.all(
      Array.from({ length: 6 }, () => hold(g.code, [[tt.id, 1]]))
    );

    expect(results.filter((r) => r.type === 'held')).toHaveLength(1);
    expect(results.filter((r) => r.type === 'inUse')).toHaveLength(5);
    expect(await usedCount(g.id)).toBe(1);
    expect(await reservedOf(tt.id)).toBe(1);
  });

  it('records the grant on the hold and returns the use on release', async () => {
    const tt = await ticketType();
    const g = await grant([tt.id], { maxUses: 1 });

    const first = held(await hold(g.code, [[tt.id, 1]]));
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: first.reservationId },
    });
    expect(row.grantId).toBe(g.id);

    expect(await release(prisma, first.reservationId)).toBe(true);
    expect(await usedCount(g.id)).toBe(0);
    expect((await hold(g.code, [[tt.id, 1]])).type).toBe('held');
  });

  it('returns the use once when a release and an expiry race', async () => {
    const tt = await ticketType();
    const g = await grant([tt.id], { maxUses: 3 });
    const res = held(await hold(g.code, [[tt.id, 2]]));

    const outcomes = await Promise.all([
      release(prisma, res.reservationId),
      expireHold(prisma, res.reservationId),
    ]);

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(await usedCount(g.id)).toBe(0);
    expect(await reservedOf(tt.id)).toBe(0);
  });

  it('reads unavailable once the use converts, and in use while it is held', async () => {
    const tt = await ticketType();
    const g = await grant([tt.id], { maxUses: 1 });
    const res = held(await hold(g.code, [[tt.id, 1]]));

    expect(
      await applyCode(prisma, { eventId: EVENT_ID, code: g.code })
    ).toEqual({ type: 'inUse' });

    await prisma.reservation.update({
      where: { id: res.reservationId },
      data: { status: ReservationStatus.CONVERTED },
    });
    expect(
      await applyCode(prisma, { eventId: EVENT_ID, code: g.code })
    ).toEqual({ type: 'unavailable' });
    expect((await hold(g.code, [[tt.id, 1]])).type).toBe('unavailable');
  });

  it('refuses an expired or revoked grant and takes nothing', async () => {
    const tt = await ticketType();
    const past = new Date(Date.now() - 60_000);
    const expired = await grant([tt.id], { expiresAt: past });
    const revoked = await grant([tt.id], { revokedAt: past });

    expect(await hold(expired.code, [[tt.id, 1]])).toEqual({
      type: 'expired',
      expiresAt: past.toISOString(),
    });
    expect(await hold(revoked.code, [[tt.id, 1]])).toEqual({
      type: 'unavailable',
    });
    expect(await usedCount(expired.id)).toBe(0);
    expect(await reservedOf(tt.id)).toBe(0);
  });

  it('caps the checkout at the grant quantity across its types, over the per-type cap', async () => {
    const a = await ticketType({ maxPerUser: 2 });
    const b = await ticketType({ maxPerUser: 2 });
    const g = await grant([a.id, b.id], { quantity: 5 });
    const [first, second] = [a.id, b.id].sort();

    const res = held(
      await hold(g.code, [
        [first, 4],
        [second, 4],
      ])
    );

    expect(res.items).toEqual([
      { ticketTypeId: first, requested: 4, granted: 4 },
      { ticketTypeId: second, requested: 1, granted: 1 },
    ]);
  });

  it('leaves a public type on the grant at its own cap without the code', async () => {
    const tt = await ticketType({ hidden: false, maxPerUser: 2 });
    await grant([tt.id], { quantity: 10, maxUses: 1 });

    const res = held(
      await createReservation(
        prisma,
        {
          eventId: EVENT_ID,
          items: [{ ticketTypeId: tt.id, quantity: 6 }],
          contact,
        },
        null
      )
    );
    expect(res.items[0].granted).toBe(2);
  });

  it('spends no use when the order holds none of the grant’s types', async () => {
    const hidden = await ticketType();
    const open = await ticketType({ hidden: false });
    const g = await grant([hidden.id], { maxUses: 1 });

    const res = held(await hold(g.code, [[open.id, 1]]));
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: res.reservationId },
    });
    expect(row.grantId).toBeNull();
    expect(await usedCount(g.id)).toBe(0);
  });

  it('never sells a hidden type the code does not list', async () => {
    const listed = await ticketType();
    const other = await ticketType();
    const g = await grant([listed.id]);

    await expect(hold(g.code, [[other.id, 1]])).rejects.toThrow(
      /not available for this event/
    );
  });
});

describe('races on one hold', () => {
  it('never issues tickets and returns the use for the same free hold', async () => {
    for (let i = 0; i < 5; i++) {
      const tt = await ticketType({ priceCents: 0 });
      const g = await grant([tt.id], { maxUses: 1 });
      const res = held(await hold(g.code, [[tt.id, 2]]));

      const [completed, released] = await Promise.allSettled([
        completeFree(prisma, { reservationId: res.reservationId }),
        release(prisma, res.reservationId),
      ]);

      const after = await prisma.ticketTypes.findUniqueOrThrow({
        where: { id: tt.id },
      });
      const issued =
        completed.status === 'fulfilled' &&
        (await prisma.tickets.count({ where: { ticketTypeId: tt.id } })) > 0;
      if (issued) {
        expect(released).toEqual({ status: 'fulfilled', value: false });
        expect(await usedCount(g.id)).toBe(1);
        expect(after).toMatchObject({ sold: 2, reserved: 0 });
      } else {
        expect(await usedCount(g.id)).toBe(0);
        expect(after).toMatchObject({ sold: 0, reserved: 0 });
      }
    }
  });
});

describe('a hold that gets no tickets', () => {
  it('keeps no use of the grant', async () => {
    const tt = await ticketType({ capacity: 1 });
    await prisma.ticketTypes.update({
      where: { id: tt.id },
      data: { sold: 1 },
    });
    const g = await grant([tt.id], { maxUses: 1 });

    const res = held(await hold(g.code, [[tt.id, 1]]));

    expect(res.items[0].granted).toBe(0);
    expect(await usedCount(g.id)).toBe(0);
    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: res.reservationId },
    });
    expect(row.grantId).toBeNull();
  });
});

describe('settle after the hold expired', () => {
  it('re-takes the use, ignoring an expiry that passed during the hold', async () => {
    const tt = await ticketType();
    const g = await grant([tt.id], { maxUses: 1 });
    const res = held(await hold(g.code, [[tt.id, 1]]));
    await expireHold(prisma, res.reservationId);
    await prisma.grant.update({
      where: { id: g.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const out = await settle(prisma, {
      reservationId: res.reservationId,
      paymentIntentId: `pi_${generateId()}`,
    });

    expect(out.kind).toBe('converted');
    expect(await usedCount(g.id)).toBe(1);
  });

  it('asks for a refund, taking no inventory, when another guest took the use', async () => {
    const tt = await ticketType();
    const g = await grant([tt.id], { maxUses: 1 });
    const first = held(await hold(g.code, [[tt.id, 1]]));
    await expireHold(prisma, first.reservationId);
    held(await hold(g.code, [[tt.id, 1]]));

    const out = await settle(prisma, {
      reservationId: first.reservationId,
      paymentIntentId: `pi_${generateId()}`,
    });

    expect(out).toEqual({ kind: 'needs_refund' });
    expect(await usedCount(g.id)).toBe(1);
    expect(await reservedOf(tt.id)).toBe(1);
  });
});

describe('visibility', () => {
  it('keeps hidden types off the public event page', async () => {
    const hidden = await ticketType();
    const open = await ticketType({ hidden: false });
    const ids = (
      await getEventDetail(prisma, { eventId: EVENT_ID })
    ).tickets.map((t) => t.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(hidden.id);
  });
});

describe('writeLegacyAccessCode', () => {
  async function codesOf(ticketTypeId: string) {
    const rows = await prisma.grantTicketType.findMany({
      where: { ticketTypeId },
      select: { grant: { select: { code: true, maxUses: true } } },
    });
    return rows.map((r) => r.grant);
  }

  it('moves a type between unlimited grants as the old column did', async () => {
    const tt = await ticketType({ hidden: false });
    const sibling = await ticketType({ hidden: false });
    const legacy = `L${generateId()}`;
    const renamed = `R${generateId()}`;

    await prisma.$transaction(async (tx) => {
      await writeLegacyAccessCode(
        tx,
        EVENT_ID,
        tt.id,
        ` ${legacy.toLowerCase()} `
      );
      await writeLegacyAccessCode(tx, EVENT_ID, sibling.id, legacy);
    });
    expect(await codesOf(tt.id)).toEqual([{ code: legacy, maxUses: null }]);
    expect(
      (await prisma.ticketTypes.findUniqueOrThrow({ where: { id: tt.id } }))
        .hidden
    ).toBe(true);

    await prisma.$transaction((tx) =>
      writeLegacyAccessCode(tx, EVENT_ID, tt.id, renamed)
    );
    expect(await codesOf(tt.id)).toEqual([{ code: renamed, maxUses: null }]);
    expect(await codesOf(sibling.id)).toEqual([
      { code: legacy, maxUses: null },
    ]);

    await prisma.$transaction((tx) =>
      writeLegacyAccessCode(tx, EVENT_ID, tt.id, '')
    );
    expect(await codesOf(tt.id)).toEqual([]);
    expect(
      (await prisma.ticketTypes.findUniqueOrThrow({ where: { id: tt.id } }))
        .hidden
    ).toBe(false);
  });
});
