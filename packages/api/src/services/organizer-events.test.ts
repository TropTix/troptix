/**
 * Unit tests for the Screen B events-list read. Pure over an injected fake
 * `prisma` (ADR 0010) — no Postgres. Covers the shared authorization seam
 * (anonymous / scoping / View-as), status derivation across all four states,
 * the capacity fallback, the completed-only sold count, and soft-delete
 * exclusion.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { listOrganizerEvents } from './organizer-events';
import { UnauthorizedError } from './_shared/errors';

const NOW = new Date('2026-07-15T12:00:00Z');

const OWNER: Actor = { kind: 'user', userId: 'owner-1', role: 'PATRON' };
const ADMIN: Actor = { kind: 'user', userId: 'admin-1', role: 'PATRON' };

function fakePrisma(opts: { email?: string; events?: unknown[] } = {}) {
  const eventsFindMany = vi.fn().mockResolvedValue(opts.events ?? []);
  const prisma = {
    users: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          opts.email === undefined
            ? { email: 'o@b.com' }
            : { email: opts.email }
        ),
    },
    events: { findMany: eventsFindMany },
  } as unknown as PrismaClient;

  return { prisma, eventsFindMany };
}

const event = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  name: 'Demo',
  imageUrl: null,
  isDraft: false,
  startsAt: new Date('2026-07-14T18:00:00Z'),
  endsAt: new Date('2026-07-16T02:00:00Z'),
  ticketTypes: [],
  _count: { tickets: 0 },
  ...over,
});

describe('listOrganizerEvents — authorization', () => {
  it('rejects an anonymous actor', async () => {
    const { prisma } = fakePrisma();
    await expect(
      listOrganizerEvents(prisma, { kind: 'anonymous' })
    ).rejects.toThrow(UnauthorizedError);
  });

  it('scopes the read to the acting organizer and excludes soft-deleted events', async () => {
    const { prisma, eventsFindMany } = fakePrisma();
    await listOrganizerEvents(prisma, OWNER, {}, NOW);

    expect(eventsFindMany.mock.calls[0][0].where).toMatchObject({
      organizerUserId: 'owner-1',
      deletedAt: null,
    });
  });

  it('ignores View-as for a non-platform-owner (pins them to themselves)', async () => {
    const { prisma, eventsFindMany } = fakePrisma({ email: 'x@gmail.com' });
    await listOrganizerEvents(
      prisma,
      OWNER,
      { viewAsOrganizerUserId: 'someone-else' },
      NOW
    );
    expect(eventsFindMany.mock.calls[0][0].where.organizerUserId).toBe(
      'owner-1'
    );
  });

  it('honors View-as for a platform owner', async () => {
    const { prisma, eventsFindMany } = fakePrisma({
      email: 'staff@usetroptix.com',
    });
    await listOrganizerEvents(
      prisma,
      ADMIN,
      { viewAsOrganizerUserId: 'target' },
      NOW
    );
    expect(eventsFindMany.mock.calls[0][0].where.organizerUserId).toBe(
      'target'
    );
  });
});

describe('listOrganizerEvents — shaping', () => {
  it('derives each status from startsAt/endsAt via the shared helper', async () => {
    const { prisma } = fakePrisma({
      events: [
        event({ id: 'draft', isDraft: true }),
        event({
          id: 'upcoming',
          startsAt: new Date('2026-08-01T00:00:00Z'),
          endsAt: new Date('2026-08-02T00:00:00Z'),
        }),
        event({
          id: 'active',
          startsAt: new Date('2026-07-14T00:00:00Z'),
          endsAt: new Date('2026-07-16T00:00:00Z'),
        }),
        event({
          id: 'past',
          startsAt: new Date('2026-06-01T00:00:00Z'),
          endsAt: new Date('2026-06-02T00:00:00Z'),
        }),
      ],
    });

    const result = await listOrganizerEvents(prisma, OWNER, {}, NOW);
    expect(result.map((e) => [e.id, e.status])).toEqual([
      ['draft', 'Draft'],
      ['upcoming', 'Upcoming'],
      ['active', 'Active'],
      ['past', 'Past'],
    ]);
  });

  it('sums capacity across tiers', async () => {
    const { prisma } = fakePrisma({
      events: [
        event({
          ticketTypes: [{ capacity: 100 }, { capacity: 50 }],
        }),
      ],
    });

    const result = await listOrganizerEvents(prisma, OWNER, {}, NOW);
    expect(result[0].capacity).toBe(150);
  });

  it('reports sold as the completed-ticket count and passes the flyer path through unresolved', async () => {
    const { prisma } = fakePrisma({
      events: [event({ imageUrl: 'flyer.jpg', _count: { tickets: 42 } })],
    });

    const result = await listOrganizerEvents(prisma, OWNER, {}, NOW);
    expect(result[0]).toMatchObject({ sold: 42, imageUrl: 'flyer.jpg' });
  });

  it('returns an empty list when the organizer has no events', async () => {
    const { prisma } = fakePrisma({ events: [] });
    const result = await listOrganizerEvents(prisma, OWNER, {}, NOW);
    expect(result).toEqual([]);
  });
});
