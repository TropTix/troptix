/**
 * @jest-environment node
 */
// next/server (NextRequest/NextResponse) requires the Node runtime's web APIs,
// not jsdom.
jest.mock('@/server/prisma', () => ({
  __esModule: true,
  default: { events: { findUnique: jest.fn() } },
}));

import { fromPartial } from '@total-typescript/shoehorn';
import type { NextRequest } from 'next/server';
import prisma from '@/server/prisma';
import { GET } from './route';

const mockFindUnique = jest.mocked(prisma.events.findUnique);

const req = () => fromPartial<NextRequest>({});
const props = (eventId: string) => ({
  params: Promise.resolve({ eventId }),
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/events/[eventId]', () => {
  it('returns the event for a published, non-deleted event', async () => {
    mockFindUnique.mockResolvedValue(
      fromPartial({
        id: 'e1',
        name: 'Concert',
        startsAt: new Date('2026-09-01T00:00:00Z'),
        organizer: 'Acme',
        address: '123 Main St',
      })
    );

    const res = await GET(req(), props('e1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ id: 'e1', name: 'Concert' });
  });

  // Asserts the query asks for the filters, not that a draft is excluded — the
  // database enforces that, so it needs a db-backed test to cover for real.
  it('queries with the draft and soft-delete filters', async () => {
    mockFindUnique.mockResolvedValue(null);

    await GET(req(), props('e1'));

    expect(mockFindUnique.mock.calls[0][0].where).toMatchObject({
      isDraft: false,
      deletedAt: null,
    });
  });

  it('returns 404 for an unknown id', async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await GET(req(), props('does-not-exist'));

    expect(res.status).toBe(404);
  });

  it('returns 400 when eventId is missing', async () => {
    const res = await GET(req(), props(''));

    expect(res.status).toBe(400);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});
