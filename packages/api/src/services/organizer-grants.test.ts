// Real Postgres via POSTGRES_PRISMA_URL (see reservations.test.ts) — point it
// at a preview/dev branch, never prod.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import prisma, { ReservationStatus } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { generateId } from './_shared/ids';
import { ConflictError, NotFoundError } from './_shared/errors';
import {
  createGrant,
  listGrants,
  revokeGrant,
  updateGrant,
} from './organizer-grants';
import { listTicketTypes } from './organizer-ticket-types';
import {
  createTicketType,
  updateTicketType,
} from './organizer-ticket-type-write';

const OWNER_ID = `test-og-owner-${generateId()}`;
const OTHER_ID = `test-og-other-${generateId()}`;
const OWNER: Actor = { kind: 'user', userId: OWNER_ID, role: 'PATRON' };
const OTHER: Actor = { kind: 'user', userId: OTHER_ID, role: 'PATRON' };
const ORG_ID = `test-og-org-${generateId()}`;
const OTHER_ORG_ID = `test-og-org2-${generateId()}`;
const EVENT_ID = `test-og-evt-${generateId()}`;
const OTHER_EVENT_ID = `test-og-evt2-${generateId()}`;
const DAY = 86_400_000;

let gala: string;
let dinner: string;
let foreign: string;

async function event(id: string, orgId: string, ownerId: string) {
  await prisma.events.create({
    data: {
      id,
      isDraft: false,
      name: 'Gala',
      description: 'Fixture for organizer-grants.test.ts',
      organizer: 'Org',
      organizerUserId: ownerId,
      organizationId: orgId,
      startsAt: new Date(Date.now() + 10 * DAY),
      endsAt: new Date(Date.now() + 11 * DAY),
      address: '1 Gala Way',
    },
  });
}

async function ticketType(eventId: string, name: string) {
  const row = await prisma.ticketTypes.create({
    data: {
      id: generateId(),
      name,
      description: '',
      maxPurchasePerUser: 4,
      capacity: 100,
      price: 0,
      priceCents: 0,
      ticketType: 'FREE',
      hidden: true,
      saleStartsAt: new Date(Date.now() - DAY),
      saleEndsAt: new Date(Date.now() + 5 * DAY),
      eventId,
    },
  });
  return row.id;
}

beforeAll(async () => {
  for (const [userId, orgId] of [
    [OWNER_ID, ORG_ID],
    [OTHER_ID, OTHER_ORG_ID],
  ]) {
    await prisma.users.create({
      data: { id: userId, email: `${userId.toLowerCase()}@troptix.test` },
    });
    await prisma.organization.create({
      data: { id: orgId, slug: orgId, displayName: 'Org', ownerUserId: userId },
    });
  }
  await event(EVENT_ID, ORG_ID, OWNER_ID);
  await event(OTHER_EVENT_ID, OTHER_ORG_ID, OTHER_ID);
  gala = await ticketType(EVENT_ID, 'Gala seat');
  dinner = await ticketType(EVENT_ID, 'Dinner');
  foreign = await ticketType(OTHER_EVENT_ID, 'Elsewhere');
});

afterAll(async () => {
  const events = [EVENT_ID, OTHER_EVENT_ID];
  await prisma.reservation.deleteMany({ where: { eventId: { in: events } } });
  await prisma.grant.deleteMany({ where: { eventId: { in: events } } });
  await prisma.ticketTypes.deleteMany({ where: { eventId: { in: events } } });
  await prisma.events.deleteMany({ where: { id: { in: events } } });
  await prisma.organization.deleteMany({
    where: { id: { in: [ORG_ID, OTHER_ORG_ID] } },
  });
  await prisma.users.deleteMany({
    where: { id: { in: [OWNER_ID, OTHER_ID] } },
  });
  await prisma.$disconnect();
});

const limits = { maxUses: null, quantity: null, expiresAt: null };

describe('createGrant', () => {
  it('stores a typed code canonical and rejects it twice on one event', async () => {
    const { code } = await createGrant(prisma, OWNER, EVENT_ID, {
      ...limits,
      code: ' presale26 ',
      ticketTypeIds: [gala],
    });
    expect(code).toBe('PRESALE26');

    await expect(
      createGrant(prisma, OWNER, EVENT_ID, {
        ...limits,
        code: 'Presale26',
        ticketTypeIds: [dinner],
      })
    ).rejects.toThrow(ConflictError);
  });

  it('generates an eight-character code without look-alike characters', async () => {
    const { code } = await createGrant(prisma, OWNER, EVENT_ID, {
      ...limits,
      maxUses: 1,
      ticketTypeIds: [gala, dinner],
      holderEmail: ' Guest@Example.com ',
      holderName: 'Dr. Guest',
    });
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    const row = await prisma.grant.findUniqueOrThrow({
      where: { eventId_code: { eventId: EVENT_ID, code } },
      include: { ticketTypes: true },
    });
    expect(row.holderEmail).toBe('guest@example.com');
    expect(row.ticketTypes.map((t) => t.ticketTypeId).sort()).toEqual(
      [gala, dinner].sort()
    );
  });

  it('refuses a ticket type from another event', async () => {
    await expect(
      createGrant(prisma, OWNER, EVENT_ID, {
        ...limits,
        ticketTypeIds: [gala, foreign],
      })
    ).rejects.toThrow(NotFoundError);
  });

  it('refuses an event the organizer does not own', async () => {
    await expect(
      createGrant(prisma, OTHER, EVENT_ID, { ...limits, ticketTypeIds: [gala] })
    ).rejects.toThrow(NotFoundError);
  });
});

describe('listGrants', () => {
  it('derives each state and flags a revoked grant with a hold open', async () => {
    const now = new Date();
    const make = async (fields: Record<string, unknown>) =>
      prisma.grant.create({
        data: {
          id: generateId(),
          eventId: EVENT_ID,
          code: `L${generateId()}`,
          ticketTypes: { create: { ticketTypeId: gala } },
          ...fields,
        },
      });
    const active = await make({ maxUses: 2, usedCount: 1 });
    const exhausted = await make({ maxUses: 1, usedCount: 1 });
    const expired = await make({ expiresAt: new Date(now.getTime() - 1000) });
    const revoked = await make({ revokedAt: now, maxUses: 1, usedCount: 1 });
    await prisma.reservation.create({
      data: {
        id: generateId(),
        eventId: EVENT_ID,
        status: ReservationStatus.HELD,
        expiresAt: new Date(now.getTime() + 600_000),
        grantId: revoked.id,
      },
    });

    const view = await listGrants(prisma, OWNER, EVENT_ID, {}, now);
    const byId = new Map(view.grants.map((g) => [g.id, g]));

    expect(byId.get(active.id)?.state).toBe('active');
    expect(byId.get(exhausted.id)?.state).toBe('exhausted');
    expect(byId.get(expired.id)?.state).toBe('expired');
    expect(byId.get(revoked.id)).toMatchObject({
      state: 'revoked',
      checkoutInProgress: true,
    });
    expect(view.ticketTypes.map((t) => t.name)).toEqual([
      'Gala seat',
      'Dinner',
    ]);
  });

  it('hides another organizer’s event', async () => {
    await expect(listGrants(prisma, OTHER, EVENT_ID)).rejects.toThrow(
      NotFoundError
    );
  });
});

describe('updateGrant and revokeGrant', () => {
  it('extends a grant but never below the uses already taken', async () => {
    const { grantId } = await createGrant(prisma, OWNER, EVENT_ID, {
      ...limits,
      maxUses: 3,
      ticketTypeIds: [gala],
    });
    await prisma.grant.update({
      where: { id: grantId },
      data: { usedCount: 2 },
    });

    const expiresAt = new Date(Date.now() + 3 * DAY);
    await updateGrant(prisma, OWNER, EVENT_ID, grantId, {
      maxUses: 5,
      quantity: 2,
      expiresAt,
    });
    expect(
      await prisma.grant.findUniqueOrThrow({ where: { id: grantId } })
    ).toMatchObject({ maxUses: 5, quantity: 2, expiresAt });

    await expect(
      updateGrant(prisma, OWNER, EVENT_ID, grantId, { ...limits, maxUses: 1 })
    ).rejects.toThrow(ConflictError);
  });

  it('revokes once, keeps the first time, and refuses a stranger', async () => {
    const { grantId } = await createGrant(prisma, OWNER, EVENT_ID, {
      ...limits,
      ticketTypeIds: [gala],
    });
    await expect(revokeGrant(prisma, OTHER, EVENT_ID, grantId)).rejects.toThrow(
      NotFoundError
    );

    const first = new Date('2026-11-01T12:00:00Z');
    await revokeGrant(prisma, OWNER, EVENT_ID, grantId, first);
    await revokeGrant(prisma, OWNER, EVENT_ID, grantId);
    expect(
      (await prisma.grant.findUniqueOrThrow({ where: { id: grantId } }))
        .revokedAt
    ).toEqual(first);
  });
});

describe('ticket types alongside grants', () => {
  const form = {
    name: 'Patron table',
    priceCents: 0,
    capacity: 10,
    maxPurchasePerUser: 2,
    saleStartsAt: new Date(Date.now() - DAY),
    saleEndsAt: new Date(Date.now() + 5 * DAY),
    ticketingFees: 'PASS_TICKET_FEES' as const,
  };

  it('notes a hidden type with no working code, and shows only an unlimited code as the type’s', async () => {
    const { ticketTypeId } = await createTicketType(prisma, OWNER, EVENT_ID, {
      ...form,
      hidden: true,
    });
    const row = async () =>
      (await listTicketTypes(prisma, OWNER, EVENT_ID)).ticketTypes.find(
        (t) => t.id === ticketTypeId
      );
    expect(await row()).toMatchObject({
      hidden: true,
      hasActiveCode: false,
      accessCode: null,
    });

    const { grantId } = await createGrant(prisma, OWNER, EVENT_ID, {
      ...limits,
      maxUses: 1,
      holderEmail: 'one@example.com',
      ticketTypeIds: [ticketTypeId],
    });
    expect(await row()).toMatchObject({
      hasActiveCode: true,
      accessCode: null,
    });

    await prisma.grant.update({
      where: { id: grantId },
      data: { usedCount: 1 },
    });
    expect(await row()).toMatchObject({ hasActiveCode: false });
  });

  it('refuses, through the old code field, a code a limited or revoked grant owns', async () => {
    const { ticketTypeId } = await createTicketType(prisma, OWNER, EVENT_ID, {
      ...form,
      hidden: true,
    });
    const { code } = await createGrant(prisma, OWNER, EVENT_ID, {
      ...limits,
      maxUses: 5,
      ticketTypeIds: [ticketTypeId],
    });
    const other = await createTicketType(prisma, OWNER, EVENT_ID, form);

    await expect(
      updateTicketType(prisma, OWNER, EVENT_ID, other.ticketTypeId, {
        ...form,
        accessCode: code,
      })
    ).rejects.toBeInstanceOf(ConflictError);
    const after = await prisma.ticketTypes.findUniqueOrThrow({
      where: { id: other.ticketTypeId },
      include: { grants: true },
    });
    expect(after.hidden).toBe(false);
    expect(after.grants).toEqual([]);
  });

  it('leaves grants alone when the form sends the hidden toggle', async () => {
    const { ticketTypeId } = await createTicketType(prisma, OWNER, EVENT_ID, {
      ...form,
      accessCode: 'TABLES',
    });
    await updateTicketType(prisma, OWNER, EVENT_ID, ticketTypeId, {
      ...form,
      hidden: false,
      accessCode: '',
    });

    const after = await prisma.ticketTypes.findUniqueOrThrow({
      where: { id: ticketTypeId },
      include: { grants: { include: { grant: true } } },
    });
    expect(after.hidden).toBe(false);
    expect(after.grants.map((g) => g.grant.code)).toEqual(['TABLES']);
  });

  it('never moves a type off an invitation, nor unhides it, through the old code field', async () => {
    const { ticketTypeId } = await createTicketType(prisma, OWNER, EVENT_ID, {
      ...form,
      hidden: true,
    });
    const { code } = await createGrant(prisma, OWNER, EVENT_ID, {
      ...limits,
      maxUses: 1,
      holderEmail: 'kept@example.com',
      ticketTypeIds: [ticketTypeId],
    });

    await updateTicketType(prisma, OWNER, EVENT_ID, ticketTypeId, {
      ...form,
      accessCode: '',
    });

    const links = await prisma.grantTicketType.findMany({
      where: { ticketTypeId },
      include: { grant: true },
    });
    expect(links.map((l) => l.grant.code)).toEqual([code]);
    expect(
      (
        await prisma.ticketTypes.findUniqueOrThrow({
          where: { id: ticketTypeId },
        })
      ).hidden
    ).toBe(true);
  });
});
