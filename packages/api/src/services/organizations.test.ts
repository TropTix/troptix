import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import {
  ensureOrganizationForUser,
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

function makeFakePrisma() {
  const orgs: OrgRow[] = [];
  let clock = 0;

  const prisma = {
    organization: {
      findFirst: async ({ where }: any) =>
        orgs
          .filter((o) => o.ownerUserId === where.ownerUserId)
          .sort((a, b) => a.createdAt - b.createdAt)[0] ?? null,
      findMany: async () => orgs.map((o) => ({ slug: o.slug })),
      create: async ({ data }: any) => {
        if (orgs.some((o) => o.ownerUserId === data.ownerUserId)) {
          throw { code: 'P2002' };
        }
        const row: OrgRow = {
          id: `org-${orgs.length}`,
          createdAt: clock++,
          ...data,
        };
        orgs.push(row);
        return row;
      },
    },
  } as unknown as PrismaClient;

  return { prisma, orgs };
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
    expect(org.slug).toBe('organizer-2');
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

  it('recovers the winner when a concurrent create hits the owner unique index', async () => {
    const { prisma, orgs } = makeFakePrisma();
    const winner = await ensureOrganizationForUser(prisma, {
      ownerUserId: 'u1',
      displayName: 'Island Vibes',
    });
    // Simulate the race: the loser's pre-create findFirst saw nothing.
    const raced = { ...prisma } as any;
    raced.organization = {
      ...(prisma as any).organization,
      findFirst: (() => {
        let calls = 0;
        return async (args: any) => {
          calls += 1;
          if (calls === 1) return null;
          return (prisma as any).organization.findFirst(args);
        };
      })(),
    };
    const b = await ensureOrganizationForUser(raced, {
      ownerUserId: 'u1',
      displayName: 'Late Arrival',
    });
    expect(b.id).toBe(winner.id);
    expect(orgs).toHaveLength(1);
  });
});

describe('getOrganizationBySlug', () => {
  const DAY = 86_400_000;
  function ev(id: string, startDays: number, endDays: number) {
    return {
      id,
      name: id,
      imageUrl: null,
      startsAt: new Date(Date.now() + startDays * DAY),
      endsAt: new Date(Date.now() + endDays * DAY),
      venue: 'The Deck',
    };
  }

  const fakePrisma = (
    events: unknown[] | null,
    onQuery?: (args: {
      select?: { events?: { where?: Record<string, unknown> } };
    }) => void
  ) =>
    ({
      organization: {
        findUnique: async ({ where, ...args }: any) => {
          onQuery?.(args);
          return events === null || where.slug !== 'island-vibes'
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
              };
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
      ev('up-soon', 2, 3),
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
  });

  it('queries only published, non-private events', async () => {
    let captured:
      | { select?: { events?: { where?: Record<string, unknown> } } }
      | undefined;
    const prisma = fakePrisma([], (args) => {
      captured = args;
    });
    await getOrganizationBySlug(prisma, { slug: 'island-vibes' });
    expect(captured?.select?.events?.where).toEqual({
      isDraft: false,
      isPrivate: false,
    });
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
        create: async ({ data }: any) => {
          if (
            orgs.some(
              (o) => o.ownerUserId === data.ownerUserId || o.slug === data.slug
            )
          ) {
            throw { code: 'P2002' };
          }
          const row = {
            id: `org-${orgs.length}`,
            createdAt: orgs.length,
            ...data,
          };
          orgs.push(row);
          return row;
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

  it('creates the Organization on a first save, with the validated slug', async () => {
    const { prisma, orgs } = makeFake(seed());
    const result = await updateOrganizationProfile(prisma, {
      ...base,
      ownerUserId: 'newbie',
      slug: 'fresh-crew',
      displayName: 'Fresh Crew',
    });
    expect(result).toEqual({ ok: true, slug: 'fresh-crew' });
    const created = orgs.find((o) => o.ownerUserId === 'newbie')!;
    expect(created.slug).toBe('fresh-crew');
    expect(created.displayName).toBe('Fresh Crew');
  });

  it('writes nothing when a first save fails slug validation (no phantom org)', async () => {
    const { prisma, orgs } = makeFake(seed());
    const before = orgs.length;
    const invalid = await updateOrganizationProfile(prisma, {
      ...base,
      ownerUserId: 'newbie',
      slug: 'ab',
    });
    const taken = await updateOrganizationProfile(prisma, {
      ...base,
      ownerUserId: 'newbie',
      slug: 'sunset',
    });
    expect(invalid).toEqual({ ok: false, reason: 'slug_invalid' });
    expect(taken).toEqual({ ok: false, reason: 'slug_taken' });
    expect(orgs).toHaveLength(before);
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
        findUnique: async () => null,
        update: async () => {
          throw { code: 'P2002' };
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
