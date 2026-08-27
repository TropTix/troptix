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
  capacity: number;
  reserved: number;
  sold: number;
  maxPurchasePerUser: number;
  saleStartsAt: Date;
  saleEndsAt: Date;
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
    reserved: 0,
    sold: 0,
    maxPurchasePerUser: 10,
    saleStartsAt: PAST,
    saleEndsAt: FUTURE,
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

function fakeEvent(
  overrides: {
    ticketTypes?: TierRow[];
    organization?: OrgRel;
    pageTheme?: 'off' | 'wash' | 'dark';
    flyerPalette?: unknown;
  } = {}
) {
  return {
    id: 'ev-1',
    name: 'Rum Punch Brunch',
    description: 'Bottomless rum punch',
    summary: 'Island brunch',
    imageUrl: 'flyer.jpg',
    isDraft: false,
    isPrivate: false,
    organizer: 'Island Brunch Co.',
    organizerUserId: 'user-1',
    organization: overrides.organization ?? null,
    startsAt: new Date('2026-07-01T18:00:00.000Z'),
    endsAt: new Date('2026-07-01T22:00:00.000Z'),
    venue: "Omar's Kitchen",
    address: '171 Ludlow St, New York, NY',
    latitude: 40.72,
    longitude: -73.98,
    pageTheme: overrides.pageTheme ?? 'off',
    flyerPalette: 'flyerPalette' in overrides ? overrides.flyerPalette : null,
    ticketTypes: overrides.ticketTypes ?? [],
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
          tier({ id: 'capped', priceCents: 7000, maxPurchasePerUser: 4 }),
        ],
      })
    );
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    const byId = Object.fromEntries(result.tickets.map((t) => [t.id, t]));
    expect(byId.soldout.maxAllowedToAdd).toBe(0);
    expect(byId.open.maxAllowedToAdd).toBe(3); // min(availability 3, max-per-user 10)
    expect(byId.capped.maxAllowedToAdd).toBe(4); // min(availability 100, max-per-user 4)
    // Available tier comes first despite being pricier.
    expect(result.tickets[0].id).toBe('open');
  });

  it('reports why each tier is unbuyable via saleStatus', async () => {
    const prisma = fakePrisma(
      fakeEvent({
        ticketTypes: [
          tier({ id: 'live' }),
          tier({ id: 'soldout', capacity: 5, sold: 5 }),
          tier({
            id: 'upcoming',
            saleStartsAt: FUTURE,
            saleEndsAt: new Date(FUTURE.getTime() + 86_400_000),
          }),
          tier({
            id: 'closed',
            saleStartsAt: new Date(PAST.getTime() - 86_400_000),
            saleEndsAt: PAST,
          }),
        ],
      })
    );
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    const byId = Object.fromEntries(result.tickets.map((t) => [t.id, t]));
    expect(byId.live.saleStatus).toBe('onSale');
    expect(byId.soldout.saleStatus).toBe('soldOut');
    expect(byId.upcoming.saleStatus).toBe('notYetOnSale');
    expect(byId.upcoming.maxAllowedToAdd).toBe(0);
    expect(byId.closed.saleStatus).toBe('saleEnded');
    expect(byId.closed.maxAllowedToAdd).toBe(0);
  });

  it('prefers soldOut over saleEnded once the window closes', async () => {
    const prisma = fakePrisma(
      fakeEvent({
        ticketTypes: [
          tier({
            id: 'gone',
            capacity: 5,
            sold: 5,
            saleStartsAt: new Date(PAST.getTime() - 86_400_000),
            saleEndsAt: PAST,
          }),
        ],
      })
    );
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.tickets[0].saleStatus).toBe('soldOut');
  });

  it('serializes dates to ISO strings', async () => {
    const prisma = fakePrisma(fakeEvent());
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.startsAt).toBe('2026-07-01T18:00:00.000Z');
    expect(result.endsAt).toBe('2026-07-01T22:00:00.000Z');
  });

  it('throws NotFoundError when the event does not exist', async () => {
    const prisma = fakePrisma(null);
    await expect(
      getEventDetail(prisma, { eventId: 'missing' })
    ).rejects.toThrow(NotFoundError);
  });

  it('passes through pageTheme and a valid flyerPalette', async () => {
    const palette = {
      dominant: '#131020',
      candidates: ['#FF4D97', '#2EE6FF'],
      chosenAccent: '#2EE6FF',
    };
    const prisma = fakePrisma(
      fakeEvent({ pageTheme: 'dark', flyerPalette: palette })
    );
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.pageTheme).toBe('dark');
    expect(result.flyerPalette).toEqual(palette);
  });

  it('degrades malformed flyerPalette JSONB to null instead of throwing', async () => {
    const prisma = fakePrisma(
      fakeEvent({
        pageTheme: 'wash',
        flyerPalette: { dominant: 'not-a-hex', unexpected: true },
      })
    );
    const result = await getEventDetail(prisma, { eventId: 'ev-1' });
    expect(result.pageTheme).toBe('wash');
    expect(result.flyerPalette).toBeNull();
  });
});

type SummaryRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  venue: string | null;
};

function summaryRow(overrides: Partial<SummaryRow> = {}): SummaryRow {
  return {
    id: 'ev-1',
    name: 'Rum Punch Brunch',
    imageUrl: 'flyer.jpg',
    startsAt: new Date('2026-07-01T18:00:00.000Z'),
    endsAt: new Date('2026-07-01T22:00:00.000Z'),
    venue: "Omar's Kitchen",
    ...overrides,
  };
}

function fakeListPrisma(
  rows: SummaryRow[],
  onQuery?: (args: { where?: Record<string, unknown> }) => void
): PrismaClient {
  return {
    events: {
      findMany: async (args: { where?: Record<string, unknown> }) => {
        onQuery?.(args);
        return rows;
      },
    },
  } as unknown as PrismaClient;
}

describe('listPublicEvents', () => {
  it('maps rows to card DTOs with ISO dates and cheapest price', async () => {
    const prisma = fakeListPrisma([
      summaryRow({ id: 'a' }),
      summaryRow({ id: 'b', venue: null, imageUrl: null }),
    ]);
    const result = await listPublicEvents(prisma);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'a',
      startsAt: '2026-07-01T18:00:00.000Z',
      endsAt: '2026-07-01T22:00:00.000Z',
    });
    expect(result[1]).toMatchObject({
      id: 'b',
      venue: null,
      imageUrl: null,
    });
  });

  it('returns an empty list when there are no events', async () => {
    const prisma = fakeListPrisma([]);
    expect(await listPublicEvents(prisma)).toEqual([]);
  });

  it('queries only published, non-private events', async () => {
    let captured: { where?: Record<string, unknown> } | undefined;
    const prisma = fakeListPrisma([], (args) => {
      captured = args;
    });
    await listPublicEvents(prisma);
    expect(captured?.where).toMatchObject({ isDraft: false, isPrivate: false });
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
