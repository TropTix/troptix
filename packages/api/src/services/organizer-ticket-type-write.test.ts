/**
 * Unit tests for the Screen E ticket-type write seam over a fake prisma
 * (ADR 0010): the authorization seam, the shared paid gate (including the
 * no-org case), ownership query shapes, and the persisted field mapping
 * (cents + legacy float + FREE/PAID + discountCode null-coalescing).
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type { TicketTypeInput } from '../contracts/organizer';
import {
  createTicketType,
  updateTicketType,
} from './organizer-ticket-type-write';
import {
  NotFoundError,
  PaidTicketingNotEnabledError,
  UnauthorizedError,
} from './_shared/errors';

const OWNER: Actor = { kind: 'user', userId: 'owner-1', role: 'PATRON' };

const input = (over: Partial<TicketTypeInput> = {}): TicketTypeInput => ({
  name: 'General Admission',
  priceCents: 0,
  capacity: 100,
  maxPurchasePerUser: 10,
  saleStartsAt: new Date('2026-08-01T00:00:00.000Z'),
  saleEndsAt: new Date('2026-08-10T00:00:00.000Z'),
  ticketingFees: 'PASS_TICKET_FEES',
  ...over,
});

function fakePrisma(
  opts: {
    paidEnabled?: boolean;
    org?: unknown; // null → no Organization row yet
    event?: unknown; // null → not owned
    ticketType?: unknown; // null → not owned
  } = {}
) {
  const eventsFindFirst = vi
    .fn()
    .mockResolvedValue(opts.event === undefined ? { id: 'e1' } : opts.event);
  const ticketTypesFindFirst = vi
    .fn()
    .mockResolvedValue(
      opts.ticketType === undefined
        ? { id: 't1', price: 0, priceCents: 0 }
        : opts.ticketType
    );
  const ticketTypesCreate = vi.fn().mockResolvedValue({});
  const ticketTypesUpdate = vi.fn().mockResolvedValue({});

  const prisma = {
    organization: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          opts.org === undefined
            ? { id: 'org-1', paidTicketingEnabled: opts.paidEnabled ?? false }
            : opts.org
        ),
    },
    events: { findFirst: eventsFindFirst },
    ticketTypes: {
      findFirst: ticketTypesFindFirst,
      create: ticketTypesCreate,
      update: ticketTypesUpdate,
    },
  } as unknown as PrismaClient;

  return {
    prisma,
    eventsFindFirst,
    ticketTypesFindFirst,
    ticketTypesCreate,
    ticketTypesUpdate,
  };
}

describe('createTicketType', () => {
  it('rejects an anonymous actor', async () => {
    const { prisma } = fakePrisma();
    await expect(
      createTicketType(prisma, { kind: 'anonymous' }, 'e1', input())
    ).rejects.toThrow(UnauthorizedError);
  });

  it('scopes the event to the acting organizer and live events', async () => {
    const { prisma, eventsFindFirst } = fakePrisma();
    await createTicketType(prisma, OWNER, 'e1', input());
    expect(eventsFindFirst.mock.calls[0][0].where).toMatchObject({
      id: 'e1',
      organizerUserId: 'owner-1',
      deletedAt: null,
    });
  });

  it('throws NotFound for an event the organizer does not own, before any write', async () => {
    const { prisma, ticketTypesCreate } = fakePrisma({ event: null });
    await expect(
      createTicketType(prisma, OWNER, 'e1', input())
    ).rejects.toThrow(NotFoundError);
    expect(ticketTypesCreate).not.toHaveBeenCalled();
  });

  it('gates a paid ticket on the org flag — including when no org exists yet', async () => {
    for (const org of [{ id: 'org-1', paidTicketingEnabled: false }, null]) {
      const { prisma, ticketTypesCreate } = fakePrisma({ org });
      await expect(
        createTicketType(prisma, OWNER, 'e1', input({ priceCents: 2500 }))
      ).rejects.toThrow(PaidTicketingNotEnabledError);
      expect(ticketTypesCreate).not.toHaveBeenCalled();
    }
  });

  it('writes the row with cents, the legacy float, the enum, and a null discountCode', async () => {
    const { prisma, ticketTypesCreate } = fakePrisma({ paidEnabled: true });
    const { ticketTypeId } = await createTicketType(
      prisma,
      OWNER,
      'e1',
      input({ priceCents: 2550, discountCode: '' })
    );

    expect(ticketTypesCreate.mock.calls[0][0].data).toMatchObject({
      id: ticketTypeId,
      eventId: 'e1',
      name: 'General Admission',
      ticketType: 'PAID',
      priceCents: 2550,
      price: 25.5,
      discountCode: null,
    });
  });
});

describe('updateTicketType', () => {
  it('scopes ownership through the owning event', async () => {
    const { prisma, ticketTypesFindFirst } = fakePrisma();
    await updateTicketType(prisma, OWNER, 'e1', 't1', input());
    expect(ticketTypesFindFirst.mock.calls[0][0].where).toMatchObject({
      id: 't1',
      eventId: 'e1',
      event: { organizerUserId: 'owner-1', deletedAt: null },
    });
  });

  it('throws NotFound for a ticket type the organizer does not own', async () => {
    const { prisma, ticketTypesUpdate } = fakePrisma({ ticketType: null });
    await expect(
      updateTicketType(prisma, OWNER, 'e1', 't1', input())
    ).rejects.toThrow(NotFoundError);
    expect(ticketTypesUpdate).not.toHaveBeenCalled();
  });

  it('gates the free → paid transition for an unapproved org', async () => {
    const { prisma, ticketTypesUpdate } = fakePrisma({ paidEnabled: false });
    await expect(
      updateTicketType(prisma, OWNER, 'e1', 't1', input({ priceCents: 100 }))
    ).rejects.toThrow(PaidTicketingNotEnabledError);
    expect(ticketTypesUpdate).not.toHaveBeenCalled();
  });

  it('leaves an already-paid row editable for an unapproved org (grandfathering)', async () => {
    const { prisma, ticketTypesUpdate } = fakePrisma({
      paidEnabled: false,
      ticketType: { id: 't1', price: 25, priceCents: 2500 },
    });
    await updateTicketType(
      prisma,
      OWNER,
      'e1',
      't1',
      input({ priceCents: 2500, capacity: 200 })
    );
    expect(ticketTypesUpdate.mock.calls[0][0].data).toMatchObject({
      capacity: 200,
      priceCents: 2500,
    });
  });

  it('grandfathers a legacy paid row that has only the float price', async () => {
    const { prisma, ticketTypesUpdate } = fakePrisma({
      paidEnabled: false,
      ticketType: { id: 't1', price: 25, priceCents: null },
    });
    await updateTicketType(
      prisma,
      OWNER,
      'e1',
      't1',
      input({ priceCents: 2500 })
    );
    expect(ticketTypesUpdate).toHaveBeenCalled();
  });

  it('updates the row fields, FREE when repriced to zero', async () => {
    const { prisma, ticketTypesUpdate } = fakePrisma();
    await updateTicketType(
      prisma,
      OWNER,
      'e1',
      't1',
      input({ priceCents: 0, name: 'RSVP List' })
    );

    const call = ticketTypesUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: 't1' });
    expect(call.data).toMatchObject({
      name: 'RSVP List',
      ticketType: 'FREE',
      priceCents: 0,
      price: 0,
    });
    expect(call.data.id).toBeUndefined();
    expect(call.data.eventId).toBeUndefined();
  });
});
