/**
 * Integration tests for the event write seam against a REAL Postgres — the
 * query-shape check the fake can't give (relations, enum coercion, defaults).
 * Same env expectations as reservations.test.ts: `POSTGRES_PRISMA_URL` via
 * apps/web/.env, loaded by vitest.config.ts. Everything is provisioned under a
 * per-run organizer id and cleaned up in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import prisma from '@troptix/db';
import type { Actor } from '../trpc/context';
import { generateId } from './_shared/ids';
import { createEvent, updateEvent } from './organizer-event-write';
import { NotFoundError, PaidTicketingNotEnabledError } from './_shared/errors';

const OWNER_ID = `test-owner-${generateId()}`;
const OWNER: Actor = { kind: 'user', userId: OWNER_ID, role: 'PATRON' };
const STRANGER: Actor = {
  kind: 'user',
  userId: `test-other-${generateId()}`,
  role: 'PATRON',
};

const STARTS = new Date('2026-09-01T20:00:00.000Z');
const ENDS = new Date('2026-09-02T02:00:00.000Z');

const input = (priceCents: number) => ({
  name: 'DB Write Test Event',
  description: 'Fixture for organizer-event-write.db.test.ts',
  startsAt: STARTS,
  endsAt: ENDS,
  venue: 'Test Pier',
  address: '9 Harbour Street, Kingston',
  ticketTypes: [
    {
      name: 'General Admission',
      priceCents,
      capacity: 50,
      maxPurchasePerUser: 4,
      saleStartsAt: new Date('2026-08-01T00:00:00.000Z'),
      saleEndsAt: ENDS,
      ticketingFees: 'PASS_TICKET_FEES' as const,
    },
  ],
});

beforeAll(async () => {
  // Organization.ownerUserId is FK'd to Users — the organizer must exist.
  await prisma.users.create({
    data: { id: OWNER_ID, email: `${OWNER_ID.toLowerCase()}@example.test` },
  });
});

afterAll(async () => {
  const events = await prisma.events.findMany({
    where: { organizerUserId: OWNER_ID },
    select: { id: true },
  });
  const ids = events.map((e) => e.id);
  await prisma.ticketTypes.deleteMany({ where: { eventId: { in: ids } } });
  await prisma.events.deleteMany({ where: { id: { in: ids } } });
  await prisma.organization.deleteMany({ where: { ownerUserId: OWNER_ID } });
  await prisma.users.deleteMany({ where: { id: OWNER_ID } });
  await prisma.$disconnect();
});

describe('createEvent (real DB)', () => {
  it('enforces the paid gate off the freshly-provisioned org (unapproved by default)', async () => {
    await expect(createEvent(prisma, OWNER, input(2500))).rejects.toThrow(
      PaidTicketingNotEnabledError
    );
  });

  it('creates event + tickets transactionally once the org is approved, dates intact', async () => {
    // The failed attempt above auto-provisioned the org; approve it.
    await prisma.organization.updateMany({
      where: { ownerUserId: OWNER_ID },
      data: { paidTicketingEnabled: true },
    });

    const { eventId } = await createEvent(prisma, OWNER, input(2500));

    const row = await prisma.events.findUnique({
      where: { id: eventId },
      include: { ticketTypes: true },
    });
    expect(row).toMatchObject({
      organizerUserId: OWNER_ID,
      isDraft: true,
      name: 'DB Write Test Event',
    });
    expect(row!.organizationId).not.toBeNull();
    expect(row!.startsAt.toISOString()).toBe(STARTS.toISOString());
    expect(row!.endsAt.toISOString()).toBe(ENDS.toISOString());
    expect(row!.ticketTypes).toHaveLength(1);
    expect(row!.ticketTypes[0]).toMatchObject({
      ticketType: 'PAID',
      priceCents: 2500,
      price: 25,
      capacity: 50,
    });
  });
});

describe('updateEvent (real DB)', () => {
  it('round-trips an edit without shifting times, and stays ownership-scoped', async () => {
    const { eventId } = await createEvent(prisma, OWNER, {
      ...input(0),
      ticketTypes: [],
    });

    const { ticketTypes: _t, ...fields } = input(0);
    await expect(
      updateEvent(prisma, STRANGER, eventId, fields)
    ).rejects.toThrow(NotFoundError);

    const movedStart = new Date('2026-09-05T21:30:00.000Z');
    const movedEnd = new Date('2026-09-06T03:00:00.000Z');
    await updateEvent(prisma, OWNER, eventId, {
      ...fields,
      name: 'Renamed DB Test Event',
      startsAt: movedStart,
      endsAt: movedEnd,
    });

    const row = await prisma.events.findUnique({ where: { id: eventId } });
    expect(row!.name).toBe('Renamed DB Test Event');
    expect(row!.startsAt.toISOString()).toBe(movedStart.toISOString());
    expect(row!.endsAt.toISOString()).toBe(movedEnd.toISOString());
  });
});
