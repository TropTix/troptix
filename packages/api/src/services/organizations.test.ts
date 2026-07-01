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
} from './organizations';

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
