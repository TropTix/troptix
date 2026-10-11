import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  getEventForEdit,
  getEventName,
  getEventNavSummary,
  listEventAttendees,
} from './organizer-events';
import { ownedOrganizations } from './_shared/owned-organizations.fixtures';

const PERSON: Actor = { kind: 'user', userId: 'person-1', role: 'PATRON' };

function fakePrisma(opts: { platformOwner?: boolean } = {}) {
  const eventsFindFirst = vi.fn().mockResolvedValue({ name: 'Fest' });
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
    events: { findFirst: eventsFindFirst },
    organization: {
      ...ownedOrganizations(['org-1']),
      findFirst: organizationFindFirst,
    },
    tickets: { findMany: ticketsFindMany },
  } as unknown as PrismaClient;
  return { prisma, eventsFindFirst, organizationFindFirst, ticketsFindMany };
}

describe('getEventNavSummary', () => {
  it('scopes the nav lookup to events of the acting organization', async () => {
    const { prisma, eventsFindFirst } = fakePrisma();
    await getEventNavSummary(prisma, PERSON, 'e1');
    expect(eventsFindFirst.mock.calls[0][0].where).toEqual({
      id: 'e1',
      organizationId: 'org-1',
      deletedAt: null,
    });
  });

  it('lets a platform owner read any live event without the organization filter', async () => {
    const { prisma, eventsFindFirst } = fakePrisma({ platformOwner: true });
    await getEventNavSummary(prisma, PERSON, 'e1');
    expect(eventsFindFirst.mock.calls[0][0].where).toEqual({
      id: 'e1',
      deletedAt: null,
    });
  });
});

describe('getEventName', () => {
  it('scopes the name lookup to events of the acting organization', async () => {
    const { prisma, eventsFindFirst } = fakePrisma();
    const event = await getEventName(prisma, PERSON, 'e1');
    expect(event).toEqual({ name: 'Fest' });
    expect(eventsFindFirst.mock.calls[0][0].where).toEqual({
      id: 'e1',
      organizationId: 'org-1',
      deletedAt: null,
    });
  });
});

describe('getEventForEdit', () => {
  it('reads the event with ticket types, scoped to the acting organization', async () => {
    const { prisma, eventsFindFirst } = fakePrisma();
    await getEventForEdit(prisma, PERSON, 'e1');
    const call = eventsFindFirst.mock.calls[0][0];
    expect(call.where).toEqual({
      id: 'e1',
      organizationId: 'org-1',
      deletedAt: null,
    });
    expect(call.include.ticketTypes.select).toHaveProperty('discountCode');
  });

  it('returns the acting organization for the paid-ticketing flag', async () => {
    const { prisma, organizationFindFirst } = fakePrisma();
    const { organization } = await getEventForEdit(prisma, PERSON, 'e1');
    expect(organizationFindFirst.mock.calls[0][0].where).toEqual({
      id: 'org-1',
    });
    expect(organization).toEqual({
      displayName: 'Org',
      paidTicketingEnabled: true,
    });
  });
});

describe('listEventAttendees', () => {
  it('lists completed-order tickets for the event, newest first, scoped to the acting organization', async () => {
    const { prisma, ticketsFindMany } = fakePrisma();
    await listEventAttendees(prisma, PERSON, 'e1');
    const call = ticketsFindMany.mock.calls[0][0];
    expect(call.where).toEqual({
      eventId: 'e1',
      event: { organizationId: 'org-1', deletedAt: null },
      order: { status: 'COMPLETED' },
    });
    expect(call.orderBy).toEqual({ createdAt: 'desc' });
  });
});
