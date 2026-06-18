/**
 * Unit tests for the public event-page read. Pure over an injected `prisma`
 * (a hand-rolled fake returning canned rows) — no Postgres (ADR 0010). Asserts
 * the "From $X" derivation (cheapest public tier, priceCents-with-legacy-
 * fallback), the no-public-tiers case, and not-found.
 */
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import { getEventDetail } from './events';
import { NotFoundError } from './_shared/errors';

type TierRow = { priceCents: number | null; price: number };

function fakeEvent(overrides: { ticketTypes?: TierRow[] } = {}) {
  return {
    id: 'ev-1',
    name: 'Rum Punch Brunch',
    description: 'Bottomless rum punch',
    summary: 'Island brunch',
    imageUrl: 'flyer.jpg',
    isDraft: false,
    organizer: 'Island Brunch Co.',
    organizerUserId: 'user-1',
    startDate: new Date('2026-07-01T18:00:00.000Z'),
    endDate: new Date('2026-07-01T22:00:00.000Z'),
    venue: "Omar's Kitchen",
    address: '171 Ludlow St, New York, NY',
    latitude: 40.72,
    longitude: -73.98,
    ticketTypes: overrides.ticketTypes ?? [],
  };
}

function fakePrisma(event: ReturnType<typeof fakeEvent> | null): PrismaClient {
  return {
    events: {
      findUnique: async () => event,
    },
  } as unknown as PrismaClient;
}

describe('getEventDetail', () => {
  it('returns the cheapest public tier as fromPriceCents (priceCents)', async () => {
    const prisma = fakePrisma(
      fakeEvent({
        ticketTypes: [
          { priceCents: 6000, price: 60 },
          { priceCents: 2500, price: 25 },
          { priceCents: 4000, price: 40 },
        ],
      })
    );
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.fromPriceCents).toBe(2500);
  });

  it('falls back to legacy price*100 when priceCents is null (pre-backfill)', async () => {
    const prisma = fakePrisma(
      fakeEvent({
        ticketTypes: [
          { priceCents: null, price: 25 },
          { priceCents: null, price: 40 },
        ],
      })
    );
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.fromPriceCents).toBe(2500);
  });

  it('returns null fromPriceCents when there are no public tiers', async () => {
    const prisma = fakePrisma(fakeEvent({ ticketTypes: [] }));
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.fromPriceCents).toBeNull();
  });

  it('serializes dates to ISO strings', async () => {
    const prisma = fakePrisma(fakeEvent());
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.startDate).toBe('2026-07-01T18:00:00.000Z');
    expect(result.endDate).toBe('2026-07-01T22:00:00.000Z');
  });

  it('throws NotFoundError when the event does not exist', async () => {
    const prisma = fakePrisma(null);
    await expect(
      getEventDetail(prisma, { eventId: 'missing' })
    ).rejects.toThrow(NotFoundError);
  });
});
