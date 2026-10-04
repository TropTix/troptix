import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { eventsInScope, resolveOrganizerScope } from './organizer-scope';
import {
  createOrganization,
  listOwnedOrganizations,
  switchToOrganization,
} from './organizations';

const day = (n: number) => new Date(Date.UTC(2026, 9, n));

const OWNED = [
  { id: 'org-a', displayName: 'Alpha', updatedAt: day(1), events: [] },
  { id: 'org-b', displayName: 'Beta', updatedAt: day(2), events: [] },
];

function fakePrisma(owned: unknown[] = OWNED, platformOwner = false) {
  const findMany = vi.fn(async (_args: any) => owned);
  const create = vi.fn(async ({ data }: any) => ({ id: 'org-new', ...data }));
  const updateMany = vi.fn(async (_args: any) => ({ count: 1 }));
  const prisma = {
    users: { findUnique: async () => ({ isPlatformOwner: platformOwner }) },
    organization: { findMany, create, updateMany },
  } as unknown as PrismaClient;
  return { prisma, findMany, create, updateMany };
}

const actor = (): Actor => ({ kind: 'user', userId: 'user-1', role: 'PATRON' });

describe('resolveOrganizerScope', () => {
  it('opens the organization whose own record was touched most recently', async () => {
    const { prisma, findMany } = fakePrisma();
    const scope = await resolveOrganizerScope(prisma, actor());
    expect(scope).toEqual({ userId: 'user-1', organizationId: 'org-b' });
    expect(findMany.mock.calls[0][0].where).toEqual({ ownerUserId: 'user-1' });
  });

  it('counts an edit to one of its events as touching the organization', async () => {
    const { prisma } = fakePrisma([
      { id: 'org-a', updatedAt: day(1), events: [{ updatedAt: day(5) }] },
      { id: 'org-b', updatedAt: day(2), events: [{ updatedAt: day(3) }] },
    ]);
    const scope = await resolveOrganizerScope(prisma, actor());
    expect(scope.organizationId).toBe('org-a');
  });

  it('has no organization for a person who owns none', async () => {
    const { prisma } = fakePrisma([]);
    const scope = await resolveOrganizerScope(prisma, actor());
    expect(scope).toEqual({ userId: 'user-1', organizationId: null });
  });

  it('scopes a platform owner’s View-as to the viewed person’s organizations', async () => {
    const { prisma, findMany } = fakePrisma(OWNED, true);
    const scope = await resolveOrganizerScope(prisma, actor(), 'user-2');
    expect(scope.userId).toBe('user-2');
    expect(findMany.mock.calls[0][0].where).toEqual({ ownerUserId: 'user-2' });
  });
});

describe('scope filters', () => {
  it('match nothing when there is no acting organization', () => {
    expect(
      eventsInScope({ userId: 'user-1', organizationId: null })
    ).toMatchObject({ id: { in: [] } });
  });

  it('narrow events to the acting organization', () => {
    expect(
      eventsInScope({ userId: 'user-1', organizationId: 'org-a' })
    ).toEqual({ organizationId: 'org-a', deletedAt: null });
  });
});

describe('switching and creating organizations', () => {
  it('lists the organizations the person owns, oldest first', async () => {
    const { prisma, findMany } = fakePrisma();
    const orgs = await listOwnedOrganizations(prisma, actor());
    expect(orgs).toEqual(OWNED);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { ownerUserId: 'user-1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('switching touches only an organization the person owns', async () => {
    const { prisma, updateMany } = fakePrisma();
    expect(await switchToOrganization(prisma, actor(), 'org-a')).toBe(true);
    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: 'org-a',
      ownerUserId: 'user-1',
    });
    expect(updateMany.mock.calls[0][0].data.updatedAt).toBeInstanceOf(Date);
  });

  it('refuses a switch to an organization the person does not own', async () => {
    const { prisma, updateMany } = fakePrisma();
    updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await switchToOrganization(prisma, actor(), 'org-x')).toBe(false);
  });

  it('creates an organization owned by the actor, with a name and slug', async () => {
    const { prisma, create } = fakePrisma();
    const org = await createOrganization(prisma, actor(), '  Island Nights ');
    expect(org.id).toBe('org-new');
    expect(create.mock.calls[0][0].data).toMatchObject({
      displayName: 'Island Nights',
      ownerUserId: 'user-1',
    });
    expect(create.mock.calls[0][0].data.slug).toMatch(/^island-nights/);
  });
});
