/**
 * Integration tests for the ticket-type write seam against a REAL Postgres.
 * Same env expectations as reservations.test.ts (`POSTGRES_PRISMA_URL` via
 * apps/web/.env). Fixtures are provisioned under a per-run organizer id and
 * cleaned up FK-safe in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import prisma from '@troptix/db';
import type { Actor } from '../trpc/context';
import { generateId } from './_shared/ids';
import { createEvent } from './organizer-event-write';
import {
  createTicketType,
  updateTicketType,
} from './organizer-ticket-type-write';
import { NotFoundError, PaidTicketingNotEnabledError } from './_shared/errors';

const OWNER_ID = `test-owner-${generateId()}`;
const OWNER: Actor = { kind: 'user', userId: OWNER_ID, role: 'PATRON' };
const STRANGER: Actor = {
  kind: 'user',
  userId: `test-other-${generateId()}`,
  role: 'PATRON',
};

let eventId: string;

const ticketInput = (priceCents: number) => ({
  name: 'Early Bird',
  description: 'First release',
  priceCents,
  capacity: 25,
  maxPurchasePerUser: 4,
  saleStartsAt: new Date('2026-08-01T00:00:00.000Z'),
  saleEndsAt: new Date('2026-09-01T00:00:00.000Z'),
  ticketingFees: 'PASS_TICKET_FEES' as const,
});

beforeAll(async () => {
  await prisma.users.create({
    data: { id: OWNER_ID, email: `${OWNER_ID.toLowerCase()}@example.test` },
  });
  ({ eventId } = await createEvent(prisma, OWNER, {
    name: 'Ticket Write Test Event',
    description: 'Fixture for organizer-ticket-type-write.db.test.ts',
    startsAt: new Date('2026-09-01T20:00:00.000Z'),
    endsAt: new Date('2026-09-02T02:00:00.000Z'),
    venue: 'Test Pier',
    address: '9 Harbour Street, Kingston',
    ticketTypes: [],
  }));
});

afterAll(async () => {
  await prisma.ticketTypes.deleteMany({ where: { eventId } });
  await prisma.events.deleteMany({ where: { id: eventId } });
  await prisma.organization.deleteMany({ where: { ownerUserId: OWNER_ID } });
  await prisma.users.deleteMany({ where: { id: OWNER_ID } });
  await prisma.$disconnect();
});

describe('createTicketType (real DB)', () => {
  it('gates a paid create off the unapproved auto-provisioned org', async () => {
    await expect(
      createTicketType(prisma, OWNER, eventId, ticketInput(2500))
    ).rejects.toThrow(PaidTicketingNotEnabledError);
  });

  it('creates a free ticket type and reads it back intact', async () => {
    const { ticketTypeId } = await createTicketType(
      prisma,
      OWNER,
      eventId,
      ticketInput(0)
    );

    const row = await prisma.ticketTypes.findUnique({
      where: { id: ticketTypeId },
    });
    expect(row).toMatchObject({
      eventId,
      name: 'Early Bird',
      ticketType: 'FREE',
      priceCents: 0,
      price: 0,
      capacity: 25,
      sold: 0,
      reserved: 0,
    });
  });

  it('allows a paid create once the org is approved', async () => {
    await prisma.organization.updateMany({
      where: { ownerUserId: OWNER_ID },
      data: { paidTicketingEnabled: true },
    });
    const { ticketTypeId } = await createTicketType(
      prisma,
      OWNER,
      eventId,
      ticketInput(2500)
    );
    const row = await prisma.ticketTypes.findUnique({
      where: { id: ticketTypeId },
    });
    expect(row).toMatchObject({ ticketType: 'PAID', priceCents: 2500 });
  });
});

describe('updateTicketType (real DB)', () => {
  it('round-trips an edit, and stays ownership-scoped', async () => {
    const { ticketTypeId } = await createTicketType(
      prisma,
      OWNER,
      eventId,
      ticketInput(0)
    );

    await expect(
      updateTicketType(prisma, STRANGER, eventId, ticketTypeId, ticketInput(0))
    ).rejects.toThrow(NotFoundError);

    await updateTicketType(prisma, OWNER, eventId, ticketTypeId, {
      ...ticketInput(1000),
      name: 'Early Bird 2',
      capacity: 50,
    });

    const row = await prisma.ticketTypes.findUnique({
      where: { id: ticketTypeId },
    });
    expect(row).toMatchObject({
      name: 'Early Bird 2',
      ticketType: 'PAID',
      priceCents: 1000,
      price: 10,
      capacity: 50,
    });
  });
});
