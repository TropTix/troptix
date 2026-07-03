/**
 * Unit tests for the public event-page read. Pure over an injected `prisma`
 * (a hand-rolled fake returning canned rows) — no Postgres (ADR 0010). Asserts
 * the tier shaping (price/fees, priceCents-with-legacy-fallback, maxAllowedToAdd
 * clamp), the "From $X" derivation, the empty case, and not-found.
 */
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import { getEventDetail, listPublicEvents } from './events';
import { NotFoundError } from './_shared/errors';

const PAST = new Date(Date.now() - 86_400_000);
const FUTURE = new Date(Date.now() + 86_400_000);

type TierRow = {
  id: string;
  name: string;
  description: string;
  priceCents: number | null;
  price: number;
  ticketingFees: 'PASS_TICKET_FEES' | 'ABSORB_TICKET_FEES';
  capacity: number | null;
  quantity: number;
  reserved: number;
  sold: number;
  maxPurchasePerUser: number;
  saleStartsAt: Date | null;
  saleStartDate: Date;
  saleEndsAt: Date | null;
  saleEndDate: Date;
};

function tier(overrides: Partial<TierRow> = {}): TierRow {
  return {
    id: 'tt-1',
    name: 'General Admission',
    description: 'GA',
    priceCents: 2500,
    price: 25,
    ticketingFees: 'ABSORB_TICKET_FEES',
    capacity: 100,
    quantity: 100,
    reserved: 0,
    sold: 0,
    maxPurchasePerUser: 10,
    saleStartsAt: null,
    saleStartDate: PAST,
    saleEndsAt: null,
    saleEndDate: FUTURE,
    ...overrides,
  };
}

type OrgRel = {
  slug: string;
  displayName: string;
  logoUrl: string | null;
  verified: boolean;
  instagram: string | null;
  twitter: string | null;
  linkedin: string | null;
  website: string | null;
} | null;

type SpotlightRow = {
  id: string;
  title: string;
  link: string | null;
  imageUrl: string | null;
  description: string | null;
};

function fakeEvent(
  overrides: {
    ticketTypes?: TierRow[];
    organization?: OrgRel;
    spotlight?: SpotlightRow[];
  } = {}
) {
  return {
    id: 'ev-1',
    name: 'Rum Punch Brunch',
    description: 'Bottomless rum punch',
    summary: 'Island brunch',
    imageUrl: 'flyer.jpg',
    isDraft: false,
    organizer: 'Island Brunch Co.',
    organizerUserId: 'user-1',
    organization: overrides.organization ?? null,
    startDate: new Date('2026-07-01T18:00:00.000Z'),
    endDate: new Date('2026-07-01T22:00:00.000Z'),
    venue: "Omar's Kitchen",
    address: '171 Ludlow St, New York, NY',
    latitude: 40.72,
    longitude: -73.98,
    ticketTypes: overrides.ticketTypes ?? [],
    spotlight: overrides.spotlight ?? [],
  };
}

function fakePrisma(event: ReturnType<typeof fakeEvent> | null): PrismaClient {
  return {
    events: { findUnique: async () => event },
  } as unknown as PrismaClient;
}

describe('getEventDetail', () => {
  it('derives fromPriceCents from the cheapest tier (priceCents)', async () => {
    const prisma = fakePrisma(
      fakeEvent({
        ticketTypes: [
          tier({ id: 'a', priceCents: 6000, price: 60 }),
          tier({ id: 'b', priceCents: 2500, price: 25 }),
          tier({ id: 'c', priceCents: 4000, price: 40 }),
        ],
      })
    );
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.fromPriceCents).toBe(2500);
    expect(result.tickets).toHaveLength(3);
    // Sorted by ascending price (all available).
    expect(result.tickets.map((t) => t.priceCents)).toEqual([2500, 4000, 6000]);
  });

  it('falls back to legacy price*100 when priceCents is null (pre-backfill)', async () => {
    const prisma = fakePrisma(
      fakeEvent({
        ticketTypes: [
          tier({ id: 'a', priceCents: null, price: 25 }),
          tier({ id: 'b', priceCents: null, price: 40 }),
        ],
      })
    );
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.fromPriceCents).toBe(2500);
  });

  it('returns empty tickets and null fromPriceCents when there are no public tiers', async () => {
    const prisma = fakePrisma(fakeEvent({ ticketTypes: [] }));
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.tickets).toEqual([]);
    expect(result.fromPriceCents).toBeNull();
  });

  it('clamps maxAllowedToAdd to availability and sorts sold-out tiers last', async () => {
    const prisma = fakePrisma(
      fakeEvent({
        ticketTypes: [
          tier({ id: 'soldout', priceCents: 1000, capacity: 5, sold: 5 }),
          tier({ id: 'open', priceCents: 5000, capacity: 5, sold: 2 }),
        ],
      })
    );
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    const byId = Object.fromEntries(result.tickets.map((t) => [t.id, t]));
    expect(byId.soldout.maxAllowedToAdd).toBe(0);
    expect(byId.open.maxAllowedToAdd).toBe(3); // min(availability 3, max-per-user 10)
    // Available tier comes first despite being pricier.
    expect(result.tickets[0].id).toBe('open');
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

type SummaryTier = { priceCents: number | null; price: number };

type SummaryRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  startDate: Date;
  endDate: Date;
  venue: string | null;
  ticketTypes: SummaryTier[];
};

function summaryRow(overrides: Partial<SummaryRow> = {}): SummaryRow {
  return {
    id: 'ev-1',
    name: 'Rum Punch Brunch',
    imageUrl: 'flyer.jpg',
    startDate: new Date('2026-07-01T18:00:00.000Z'),
    endDate: new Date('2026-07-01T22:00:00.000Z'),
    venue: "Omar's Kitchen",
    ticketTypes: [{ priceCents: 2500, price: 25 }],
    ...overrides,
  };
}

function fakeListPrisma(rows: SummaryRow[]): PrismaClient {
  return {
    events: { findMany: async () => rows },
  } as unknown as PrismaClient;
}

describe('listPublicEvents', () => {
  it('maps rows to card DTOs with ISO dates and cheapest price', async () => {
    const prisma = fakeListPrisma([
      summaryRow({ id: 'a', ticketTypes: [{ priceCents: 2500, price: 25 }] }),
      summaryRow({
        id: 'b',
        venue: null,
        imageUrl: null,
        ticketTypes: [{ priceCents: 8000, price: 80 }],
      }),
    ]);
    const result = await listPublicEvents(prisma);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'a',
      fromPriceCents: 2500,
      startDate: '2026-07-01T18:00:00.000Z',
      endDate: '2026-07-01T22:00:00.000Z',
    });
    expect(result[1]).toMatchObject({
      id: 'b',
      venue: null,
      imageUrl: null,
      fromPriceCents: 8000,
    });
  });

  it('falls back to legacy price*100 when priceCents is null (pre-backfill)', async () => {
    const prisma = fakeListPrisma([
      summaryRow({ ticketTypes: [{ priceCents: null, price: 40 }] }),
    ]);
    const result = await listPublicEvents(prisma);
    expect(result[0].fromPriceCents).toBe(4000);
  });

  it('returns null fromPriceCents when an event has no public tiers', async () => {
    const prisma = fakeListPrisma([summaryRow({ ticketTypes: [] })]);
    const result = await listPublicEvents(prisma);
    expect(result[0].fromPriceCents).toBeNull();
  });

  it('returns an empty list when there are no events', async () => {
    const prisma = fakeListPrisma([]);
    expect(await listPublicEvents(prisma)).toEqual([]);
  });
});

describe('getEventDetail — hostedBy', () => {
  it('maps the hosting organization when present', async () => {
    const prisma = fakePrisma(
      fakeEvent({
        organization: {
          slug: 'island-brunch',
          displayName: 'Island Brunch Co.',
          logoUrl: null,
          verified: true,
          instagram: 'islandbrunch',
          twitter: null,
          linkedin: null,
          website: 'islandbrunch.co',
        },
      })
    );
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.hostedBy).toEqual({
      slug: 'island-brunch',
      displayName: 'Island Brunch Co.',
      logoUrl: null,
      verified: true,
      instagram: 'islandbrunch',
      twitter: null,
      linkedin: null,
      website: 'islandbrunch.co',
    });
  });

  it('is null when the event has no organization (pre-backfill)', async () => {
    const prisma = fakePrisma(fakeEvent());
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.hostedBy).toBeNull();
  });
});

describe('getEventDetail — spotlight', () => {
  it('returns spotlight cards as provided (already ordered by the query)', async () => {
    const prisma = fakePrisma(
      fakeEvent({
        spotlight: [
          {
            id: 's1',
            title: 'DJ Kala',
            link: 'instagram.com/djkala',
            imageUrl: 'spotlight/kala.jpg',
            description: 'Headliner',
          },
          {
            id: 's2',
            title: 'Rum Sponsor',
            link: null,
            imageUrl: null,
            description: null,
          },
        ],
      })
    );
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.spotlight).toEqual([
      {
        id: 's1',
        title: 'DJ Kala',
        link: 'instagram.com/djkala',
        imageUrl: 'spotlight/kala.jpg',
        description: 'Headliner',
      },
      {
        id: 's2',
        title: 'Rum Sponsor',
        link: null,
        imageUrl: null,
        description: null,
      },
    ]);
  });

  it('is an empty array when the event has no spotlight cards', async () => {
    const prisma = fakePrisma(fakeEvent());
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.spotlight).toEqual([]);
  });
});
