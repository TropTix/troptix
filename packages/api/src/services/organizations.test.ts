/**
 * Unit tests for Organization provisioning over a stateful hand-rolled fake
 * prisma (no Postgres, ADR 0010). Covers lazy-create idempotency, unique-slug
 * generation, the empty-name fallback, and the backfill mapping (one org per
 * organizer, most-recent display name, event linking, re-run idempotency).
 */
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import {
  ensureOrganizationForUser,
  backfillOrganizations,
  getOrganizationBySlug,
  updateOrganizationProfile,
} from './organizations';
import { NotFoundError } from './_shared/errors';

type OrgRow = {
  id: string;
  ownerUserId: string;
  displayName: string;
  slug: string;
  createdAt: number;
};
type EventRow = {
  organizerUserId: string;
  organizer: string;
  organizationId: string | null;
  createdAt: number;
};

function makeFakePrisma(seedEvents: EventRow[] = []) {
  const orgs: OrgRow[] = [];
  const events = seedEvents.map((e) => ({ ...e }));
  let clock = 0;

  const prisma = {
    organization: {
      findFirst: async ({ where }: any) =>
        orgs
          .filter((o) => o.ownerUserId === where.ownerUserId)
          .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null,
      findMany: async () => orgs.map((o) => ({ slug: o.slug })),
      create: async ({ data }: any) => {
        const row: OrgRow = {
          id: `org-${orgs.length}`,
          createdAt: clock++,
          ...data,
        };
        orgs.push(row);
        return row;
      },
    },
    events: {
      findMany: async ({ where, orderBy }: any) => {
        let rows = events.filter((e) =>
          where?.organizationId === null ? e.organizationId === null : true
        );
        if (orderBy?.createdAt === 'desc') {
          rows = [...rows].sort((a, b) => b.createdAt - a.createdAt);
        }
        return rows.map((e) => ({
          organizerUserId: e.organizerUserId,
          organizer: e.organizer,
        }));
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const e of events) {
          const matchNull =
            where.organizationId === null ? e.organizationId === null : true;
          if (e.organizerUserId === where.organizerUserId && matchNull) {
            e.organizationId = data.organizationId;
            count++;
          }
        }
        return { count };
      },
    },
  } as unknown as PrismaClient;

  return { prisma, orgs, events };
}

describe('ensureOrganizationForUser', () => {
  it('creates an organization with a slug derived from the name', async () => {
    const { prisma, orgs } = makeFakePrisma();
    const org = await ensureOrganizationForUser(prisma, {
      ownerUserId: 'u1',
      displayName: 'Island Vibes',
    });
    expect(org.ownerUserId).toBe('u1');
    expect(org.slug).toBe('island-vibes');
    expect(orgs).toHaveLength(1);
  });

  it('is idempotent — returns the existing org, never a second one', async () => {
    const { prisma, orgs } = makeFakePrisma();
    const a = await ensureOrganizationForUser(prisma, {
      ownerUserId: 'u1',
      displayName: 'Island Vibes',
    });
    const b = await ensureOrganizationForUser(prisma, {
      ownerUserId: 'u1',
      displayName: 'A Totally Different Name',
    });
    expect(b.id).toBe(a.id);
    expect(orgs).toHaveLength(1);
  });

  it('generates a unique slug when two users share a name', async () => {
    const { prisma } = makeFakePrisma();
    const a = await ensureOrganizationForUser(prisma, {
      ownerUserId: 'u1',
      displayName: 'Vibes',
    });
    const b = await ensureOrganizationForUser(prisma, {
      ownerUserId: 'u2',
      displayName: 'Vibes',
    });
    expect(a.slug).toBe('vibes');
    expect(b.slug).toBe('vibes-2');
  });

  it('falls back to a default name (and non-reserved slug) when blank', async () => {
    const { prisma } = makeFakePrisma();
    const org = await ensureOrganizationForUser(prisma, {
      ownerUserId: 'u1',
      displayName: '',
    });
    expect(org.displayName).toBe('Organizer');
    expect(org.slug).toBe('organizer-2'); // "organizer" is reserved
  });

  it('falls back when the name is only whitespace', async () => {
    const { prisma } = makeFakePrisma();
    const org = await ensureOrganizationForUser(prisma, {
      ownerUserId: 'u1',
      displayName: '   ',
    });
    expect(org.displayName).toBe('Organizer');
  });

  it('trims a padded display name', async () => {
    const { prisma } = makeFakePrisma();
    const org = await ensureOrganizationForUser(prisma, {
      ownerUserId: 'u1',
      displayName: '  Island Vibes  ',
    });
    expect(org.displayName).toBe('Island Vibes');
    expect(org.slug).toBe('island-vibes');
  });
});

describe('backfillOrganizations', () => {
  it('creates one org per organizer using the most-recent name and links events', async () => {
    const { prisma, orgs, events } = makeFakePrisma([
      {
        organizerUserId: 'u1',
        organizer: 'Old Name',
        organizationId: null,
        createdAt: 1,
      },
      {
        organizerUserId: 'u1',
        organizer: 'New Name',
        organizationId: null,
        createdAt: 5,
      },
      {
        organizerUserId: 'u2',
        organizer: 'Solo Fetes',
        organizationId: null,
        createdAt: 3,
      },
    ]);

    const result = await backfillOrganizations(prisma);

    expect(result).toEqual({ organizationsEnsured: 2, eventsLinked: 3 });
    expect(orgs).toHaveLength(2);
    const u1 = orgs.find((o) => o.ownerUserId === 'u1')!;
    expect(u1.displayName).toBe('New Name'); // most-recent wins
    expect(u1.slug).toBe('new-name');
    expect(events.every((e) => e.organizationId !== null)).toBe(true);
    expect(
      events
        .filter((e) => e.organizerUserId === 'u1')
        .every((e) => e.organizationId === u1.id)
    ).toBe(true);
  });

  it('is idempotent — a second run links nothing new', async () => {
    const { prisma } = makeFakePrisma([
      {
        organizerUserId: 'u1',
        organizer: 'Vibes',
        organizationId: null,
        createdAt: 1,
      },
    ]);
    await backfillOrganizations(prisma);
    const second = await backfillOrganizations(prisma);
    expect(second).toEqual({ organizationsEnsured: 0, eventsLinked: 0 });
  });
});

describe('getOrganizationBySlug', () => {
  const DAY = 86_400_000;
  function ev(
    id: string,
    startDays: number,
    endDays: number,
    tier?: { priceCents: number | null; price: number }
  ) {
    return {
      id,
      name: id,
      imageUrl: null,
      startsAt: new Date(Date.now() + startDays * DAY),
      endsAt: new Date(Date.now() + endDays * DAY),
      venue: 'The Deck',
      ticketTypes: tier ? [tier] : [],
    };
  }

  const fakePrisma = (events: unknown[] | null) =>
    ({
      organization: {
        findUnique: async ({ where }: any) =>
          events === null || where.slug !== 'island-vibes'
            ? null
            : {
                slug: 'island-vibes',
                displayName: 'Island Vibes',
                logoUrl: null,
                bio: 'Soca everywhere',
                website: null,
                instagram: 'islandvibes',
                twitter: null,
                linkedin: null,
                verified: true,
                events,
              },
      },
    }) as unknown as PrismaClient;

  it('throws NotFoundError when the slug does not exist', async () => {
    await expect(
      getOrganizationBySlug(fakePrisma(null), { slug: 'nope' })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('splits events into upcoming (soonest first) and past (most-recent first)', async () => {
    // provided startsAt-asc, as the query returns them
    const prisma = fakePrisma([
      ev('past-old', -10, -9),
      ev('past-recent', -3, -2),
      ev('up-soon', 2, 3, { priceCents: 2500, price: 25 }),
      ev('up-later', 8, 9),
    ]);
    const result = await getOrganizationBySlug(prisma, {
      slug: 'island-vibes',
    });

    expect(result.displayName).toBe('Island Vibes');
    expect(result.verified).toBe(true);
    expect(result.instagram).toBe('islandvibes');
    expect(result.upcomingEvents.map((e) => e.id)).toEqual([
      'up-soon',
      'up-later',
    ]);
    expect(result.pastEvents.map((e) => e.id)).toEqual([
      'past-recent',
      'past-old',
    ]);
    expect(result.upcomingEvents[0].fromPriceCents).toBe(2500);
    expect(result.upcomingEvents[1].fromPriceCents).toBeNull();
  });
});

describe('updateOrganizationProfile', () => {
  type Org = {
    id: string;
    ownerUserId: string;
    slug: string;
    displayName: string;
    createdAt: number;
    bio?: string | null;
    website?: string | null;
    instagram?: string | null;
    twitter?: string | null;
    linkedin?: string | null;
  };

  function makeFake(seed: Org[]) {
    const orgs = seed.map((o) => ({ ...o }));
    const prisma = {
      organization: {
        findFirst: async ({ where }: any) =>
          orgs
            .filter((o) => o.ownerUserId === where.ownerUserId)
            .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null,
        findUnique: async ({ where }: any) =>
          orgs.find((o) => o.slug === where.slug) ?? null,
        update: async ({ where, data }: any) => {
          const o = orgs.find((x) => x.id === where.id)!;
          Object.assign(o, data);
          return o;
        },
      },
    } as unknown as PrismaClient;
    return { prisma, orgs };
  }

  const base = {
    ownerUserId: 'u1',
    displayName: 'Island Vibes',
    slug: 'island-vibes',
    logoUrl: null,
    bio: null,
    website: null,
    instagram: null,
    twitter: null,
    linkedin: null,
  };

  const seed = (): Org[] => [
    {
      id: 'a',
      ownerUserId: 'u1',
      slug: 'island-vibes',
      displayName: 'Island Vibes',
      createdAt: 0,
    },
    {
      id: 'b',
      ownerUserId: 'u2',
      slug: 'sunset',
      displayName: 'Sunset',
      createdAt: 1,
    },
  ];

  it('updates fields and blanks to null', async () => {
    const { prisma, orgs } = makeFake(seed());
    const result = await updateOrganizationProfile(prisma, {
      ...base,
      displayName: 'Island Vibes Collective',
      bio: '  Soca everywhere  ',
      instagram: '   ',
    });
    expect(result).toEqual({ ok: true, slug: 'island-vibes' });
    const a = orgs.find((o) => o.id === 'a')!;
    expect(a.displayName).toBe('Island Vibes Collective');
    expect(a.bio).toBe('Soca everywhere');
    expect(a.instagram).toBeNull();
  });

  it('allows keeping the current slug (no false "taken")', async () => {
    const { prisma } = makeFake(seed());
    const result = await updateOrganizationProfile(prisma, base);
    expect(result).toEqual({ ok: true, slug: 'island-vibes' });
  });

  it('rejects a slug taken by another org', async () => {
    const { prisma } = makeFake(seed());
    const result = await updateOrganizationProfile(prisma, {
      ...base,
      slug: 'sunset',
    });
    expect(result).toEqual({ ok: false, reason: 'slug_taken' });
  });

  it('rejects an invalid slug', async () => {
    const { prisma } = makeFake(seed());
    const result = await updateOrganizationProfile(prisma, {
      ...base,
      slug: 'ab',
    });
    expect(result).toEqual({ ok: false, reason: 'slug_invalid' });
  });

  it('returns not_found when the user has no org', async () => {
    const { prisma } = makeFake(seed());
    const result = await updateOrganizationProfile(prisma, {
      ...base,
      ownerUserId: 'nobody',
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('maps a slug unique-constraint violation (race) to slug_taken', async () => {
    const prisma = {
      organization: {
        findFirst: async () => ({
          id: 'a',
          ownerUserId: 'u1',
          slug: 'island-vibes',
          displayName: 'Island Vibes',
        }),
        findUnique: async () => null, // check passes…
        update: async () => {
          throw { code: 'P2002' }; // …but another write claimed the slug first
        },
      },
    } as unknown as PrismaClient;
    const result = await updateOrganizationProfile(prisma, {
      ...base,
      slug: 'new-slug',
    });
    expect(result).toEqual({ ok: false, reason: 'slug_taken' });
  });
});
