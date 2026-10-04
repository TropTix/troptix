import { vi } from 'vitest';

/** For fake Prisma clients: the Organizations the person being scoped owns. */
export function ownedOrganizations(ids: string[] = ['org-1']) {
  return {
    findMany: vi.fn(async () =>
      ids.map((id) => ({ id, updatedAt: new Date(0), events: [] }))
    ),
  };
}
