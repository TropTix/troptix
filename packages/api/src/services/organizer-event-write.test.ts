/**
 * Unit tests for the Screen D event write seam, pure over a hand-rolled fake
 * prisma (ADR 0010). Covers the authorization seam, the paid-ticketing gate,
 * the transaction's row shapes (priceCents + legacy float, FREE/PAID), the
 * ownership-scoped update, and that dates pass through untouched (the
 * matched-pair guarantee: what the form sends is what the row stores).
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type { CreateEventInput } from '../contracts/organizer';
import { createEvent, updateEvent } from './organizer-event-write';
import {
  NotFoundError,
  PaidTicketingNotEnabledError,
  UnauthorizedError,
} from './_shared/errors';
import { assertPaidTicketingAllowed } from './_shared/paid-ticketing';

const OWNER: Actor = { kind: 'user', userId: 'owner-1', role: 'PATRON' };

const STARTS = new Date('2026-09-01T20:00:00.000Z');
const ENDS = new Date('2026-09-02T02:00:00.000Z');

const baseInput = (over: Partial<CreateEventInput> = {}): CreateEventInput => ({
  name: 'Sunset Cruise',
  description: 'Boat party',
  startsAt: STARTS,
  endsAt: ENDS,
  venue: 'Pier 9',
  address: '9 Harbour Street, Kingston',
  ticketTypes: [],
  ...over,
});

const ticket = (priceCents: number) => ({
  name: 'General Admission',
  priceCents,
  capacity: 100,
  maxPurchasePerUser: 10,
  saleStartsAt: new Date('2026-08-01T00:00:00.000Z'),
  saleEndsAt: ENDS,
  ticketingFees: 'PASS_TICKET_FEES' as const,
});

function fakePrisma(opts: { paidEnabled?: boolean; event?: unknown } = {}) {
  const org = {
    id: 'org-1',
    ownerUserId: 'owner-1',
    displayName: 'Eman Events',
    paidTicketingEnabled: opts.paidEnabled ?? false,
  };

  const eventsCreate = vi.fn().mockResolvedValue({});
  const ticketTypesCreate = vi.fn().mockResolvedValue({});
  const eventsFindFirst = vi
    .fn()
    .mockResolvedValue(opts.event === undefined ? { id: 'e1' } : opts.event);
  const eventsUpdate = vi.fn().mockResolvedValue({});

  const prisma = {
    users: {
      findUnique: vi.fn().mockResolvedValue({ email: 'o@b.com' }),
    },
    organization: {
      findFirst: vi.fn().mockResolvedValue(org),
    },
    events: { findFirst: eventsFindFirst, update: eventsUpdate },
    $transaction: vi.fn(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        await fn({
          events: { create: eventsCreate },
          ticketTypes: { create: ticketTypesCreate },
        })
    ),
  } as unknown as PrismaClient;

  return {
    prisma,
    eventsCreate,
    ticketTypesCreate,
    eventsFindFirst,
    eventsUpdate,
  };
}

describe('assertPaidTicketingAllowed', () => {
  it('lets any price through for an approved org', () => {
    expect(() =>
      assertPaidTicketingAllowed({ paidTicketingEnabled: true }, [
        { priceCents: 5000 },
      ])
    ).not.toThrow();
  });

  it('lets free tickets through for an unapproved org', () => {
    expect(() =>
      assertPaidTicketingAllowed({ paidTicketingEnabled: false }, [
        { priceCents: 0 },
      ])
    ).not.toThrow();
  });

  it('rejects a priced ticket for an unapproved org', () => {
    expect(() =>
      assertPaidTicketingAllowed({ paidTicketingEnabled: false }, [
        { priceCents: 0 },
        { priceCents: 1 },
      ])
    ).toThrow(PaidTicketingNotEnabledError);
  });
});

describe('createEvent', () => {
  it('rejects an anonymous actor', async () => {
    const { prisma } = fakePrisma();
    await expect(
      createEvent(prisma, { kind: 'anonymous' }, baseInput())
    ).rejects.toThrow(UnauthorizedError);
  });

  it('rejects a paid ticket when the org is not approved, before any write', async () => {
    const { prisma, eventsCreate } = fakePrisma({ paidEnabled: false });
    await expect(
      createEvent(prisma, OWNER, baseInput({ ticketTypes: [ticket(2500)] }))
    ).rejects.toThrow(PaidTicketingNotEnabledError);
    expect(eventsCreate).not.toHaveBeenCalled();
  });

  it('creates the event owned by the actor, as a draft, with the org brand mirrored', async () => {
    const { prisma, eventsCreate } = fakePrisma();
    const { eventId } = await createEvent(prisma, OWNER, baseInput());

    const data = eventsCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      id: eventId,
      organizerUserId: 'owner-1',
      organizationId: 'org-1',
      organizer: 'Eman Events',
      isDraft: true,
      name: 'Sunset Cruise',
    });
    // The matched pair: the instants the caller sent are stored verbatim
    // (zod clones Date objects, so compare instants, not identity).
    expect(data.startsAt).toStrictEqual(STARTS);
    expect(data.endsAt).toStrictEqual(ENDS);
  });

  it('writes ticket types with both integer cents and the legacy float', async () => {
    const { prisma, ticketTypesCreate } = fakePrisma({ paidEnabled: true });
    await createEvent(
      prisma,
      OWNER,
      baseInput({ ticketTypes: [ticket(2550), ticket(0)] })
    );

    const rows = ticketTypesCreate.mock.calls.map((c) => c[0].data);
    expect(rows[0]).toMatchObject({
      priceCents: 2550,
      price: 25.5,
      ticketType: 'PAID',
      capacity: 100,
      maxPurchasePerUser: 10,
      ticketingFees: 'PASS_TICKET_FEES',
    });
    expect(rows[1]).toMatchObject({
      priceCents: 0,
      price: 0,
      ticketType: 'FREE',
    });
  });

  it('rejects an event that ends before it starts', async () => {
    const { prisma } = fakePrisma();
    await expect(
      createEvent(prisma, OWNER, baseInput({ startsAt: ENDS, endsAt: STARTS }))
    ).rejects.toThrow();
  });
});

describe('updateEvent', () => {
  const { ticketTypes: _ignored, ...updateInput } = baseInput();

  it('scopes the ownership check to the acting organizer and live events', async () => {
    const { prisma, eventsFindFirst } = fakePrisma();
    await updateEvent(prisma, OWNER, 'e1', updateInput);
    expect(eventsFindFirst.mock.calls[0][0].where).toMatchObject({
      id: 'e1',
      organizerUserId: 'owner-1',
      deletedAt: null,
    });
  });

  it('throws NotFound for an event the organizer does not own', async () => {
    const { prisma, eventsUpdate } = fakePrisma({ event: null });
    await expect(updateEvent(prisma, OWNER, 'e1', updateInput)).rejects.toThrow(
      NotFoundError
    );
    expect(eventsUpdate).not.toHaveBeenCalled();
  });

  it('updates event fields only, refreshing the org linkage, dates verbatim', async () => {
    const { prisma, eventsUpdate } = fakePrisma();
    await updateEvent(prisma, OWNER, 'e1', {
      ...updateInput,
      name: 'Renamed Cruise',
    });

    const call = eventsUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'e1' });
    expect(call.data).toMatchObject({
      name: 'Renamed Cruise',
      organizationId: 'org-1',
      organizer: 'Eman Events',
    });
    expect(call.data.startsAt).toStrictEqual(STARTS);
    expect(call.data.endsAt).toStrictEqual(ENDS);
    // Event fields only — ticket writes belong to Screen E's seam.
    expect(call.data.ticketTypes).toBeUndefined();
  });
});
