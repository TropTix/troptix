/**
 * Unit tests for spotlight authoring. Pure over an injected `prisma` fake
 * (ADR 0010) — asserts ownership enforcement and the full-replace persist
 * (delete-all → create-in-order).
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import { saveEventSpotlight } from './spotlight';
import { NotFoundError } from './_shared/errors';

type SavedRow = {
  id: string;
  title: string;
  link: string | null;
  imageUrl: string | null;
  description: string | null;
};

function fakePrisma({
  event,
  saved = [],
}: {
  event: { id: string } | null;
  saved?: SavedRow[];
}) {
  const deleteMany = vi.fn(async () => ({ count: 0 }));
  const createMany = vi.fn(async () => ({ count: 0 }));
  const findMany = vi.fn(async () => saved);
  const prisma = {
    events: { findFirst: vi.fn(async () => event) },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ spotlight: { deleteMany, createMany } })
    ),
    spotlight: { findMany },
  } as unknown as PrismaClient;
  return { prisma, deleteMany, createMany, findMany };
}

const item = (title: string) => ({
  title,
  link: null,
  imageUrl: null,
  description: null,
});

describe('saveEventSpotlight', () => {
  it('throws NotFoundError when the event is missing or not owned by the caller', async () => {
    const { prisma, deleteMany } = fakePrisma({ event: null });
    await expect(
      saveEventSpotlight(prisma, {
        eventId: 'ev-1',
        ownerUserId: 'user-1',
        items: [item('DJ Kala')],
      })
    ).rejects.toThrow(NotFoundError);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('replaces all cards, assigning order from array position', async () => {
    const saved: SavedRow[] = [
      { id: 's1', title: 'A', link: null, imageUrl: null, description: null },
      { id: 's2', title: 'B', link: null, imageUrl: null, description: null },
    ];
    const { prisma, deleteMany, createMany } = fakePrisma({
      event: { id: 'ev-1' },
      saved,
    });

    const result = await saveEventSpotlight(prisma, {
      eventId: 'ev-1',
      ownerUserId: 'user-1',
      items: [
        { title: 'A', link: 'a.com', imageUrl: 'a.jpg', description: 'first' },
        item('B'),
      ],
    });

    expect(deleteMany).toHaveBeenCalledWith({ where: { eventId: 'ev-1' } });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          eventId: 'ev-1',
          title: 'A',
          link: 'a.com',
          imageUrl: 'a.jpg',
          description: 'first',
          order: 0,
        },
        {
          eventId: 'ev-1',
          title: 'B',
          link: null,
          imageUrl: null,
          description: null,
          order: 1,
        },
      ],
    });
    expect(result).toEqual(saved);
  });

  it('clears all cards without creating when items is empty', async () => {
    const { prisma, deleteMany, createMany } = fakePrisma({
      event: { id: 'ev-1' },
    });

    const result = await saveEventSpotlight(prisma, {
      eventId: 'ev-1',
      ownerUserId: 'user-1',
      items: [],
    });

    expect(deleteMany).toHaveBeenCalledWith({ where: { eventId: 'ev-1' } });
    expect(createMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
