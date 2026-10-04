import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  getEventForEdit,
  getEventName,
  getEventNavSummary,
  listEventAttendees,
} from './organizer-events';

const PERSON: Actor = { kind: 'user', userId: 'person-1', role: 'PATRON' };

function fakePrisma(opts: { platformOwner?: boolean } = {}) {
  const eventsFindUnique = vi.fn().mockResolvedValue({ name: 'Fest' });
  const organizationFindFirst = vi
    .fn()
    .mockResolvedValue({ displayName: 'Org', paidTicketingEnabled: true });
  const ticketsFindMany = vi.fn().mockResolvedValue([]);
  const prisma = {
    users: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ isPlatformOwner: opts.platformOwner ?? false }),
    },
    events: { findUnique: eventsFindUnique },
    organization: { findFirst: organizationFindFirst },
    tickets: { findMany: ticketsFindMany },
  } as unknown as PrismaClient;
  return { prisma, eventsFindUnique, organizationFindFirst, ticketsFindMany };
}

describe('getEventNavSummary', () => {
  it('scopes the nav lookup to the person’s own events', async () => {
    const { prisma, eventsFindUnique } = fakePrisma();
    await getEventNavSummary(prisma, PERSON, 'e1');
    expect(eventsFindUnique.mock.calls[0][0].where).toEqual({
      id: 'e1',
      deletedAt: null,
      organizerUserId: 'person-1',
    });
  });

  it('lets a platform owner read any live event without the ownership filter', async () => {
    const { prisma, eventsFindUnique } = fakePrisma({ platformOwner: true });
    await getEventNavSummary(prisma, PERSON, 'e1');
    expect(eventsFindUnique.mock.calls[0][0].where).toEqual({
      id: 'e1',
      deletedAt: null,
    });
  });
});

describe('getEventName', () => {
  it('scopes the name lookup to the person’s own live events', async () => {
    const { prisma, eventsFindUnique } = fakePrisma();
    const event = await getEventName(prisma, PERSON, 'e1');
    expect(event).toEqual({ name: 'Fest' });
    expect(eventsFindUnique.mock.calls[0][0].where).toEqual({
      id: 'e1',
      organizerUserId: 'person-1',
      deletedAt: null,
    });
  });
});

describe('getEventForEdit', () => {
  it('reads the event with ticket types, scoped to the person’s own events', async () => {
    const { prisma, eventsFindUnique } = fakePrisma();
    await getEventForEdit(prisma, PERSON, 'e1');
    const call = eventsFindUnique.mock.calls[0][0];
    expect(call.where).toEqual({
      id: 'e1',
      organizerUserId: 'person-1',
      deletedAt: null,
    });
    expect(call.include.ticketTypes.select).toHaveProperty('discountCode');
  });

  it('returns the person’s own organization for the paid-ticketing flag', async () => {
    const { prisma, organizationFindFirst } = fakePrisma();
    const { organization } = await getEventForEdit(prisma, PERSON, 'e1');
    expect(organizationFindFirst.mock.calls[0][0].where).toEqual({
      ownerUserId: 'person-1',
    });
    expect(organization).toEqual({
      displayName: 'Org',
      paidTicketingEnabled: true,
    });
  });
});

describe('listEventAttendees', () => {
  it('lists completed-order tickets for the event, newest first, scoped to the person', async () => {
    const { prisma, ticketsFindMany } = fakePrisma();
    await listEventAttendees(prisma, PERSON, 'e1');
    const call = ticketsFindMany.mock.calls[0][0];
    expect(call.where).toEqual({
      eventId: 'e1',
      event: { organizerUserId: 'person-1', deletedAt: null },
      order: { status: 'COMPLETED' },
    });
    expect(call.orderBy).toEqual({ createdAt: 'desc' });
  });
});
