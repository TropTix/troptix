/**
 * Unit tests for the Screen G order reads. Pure over an injected fake `prisma`
 * (ADR 0010). Covers the shared authorization seam (anonymous, scoping, View-as,
 * not-found), the cents boundary + the legacy float fallback, ticket-count and
 * line-item grouping, and the payment-method shaping.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { getOrderDetail, listEventOrders } from './organizer-orders';
import { NotFoundError, UnauthorizedError } from './_shared/errors';

const OWNER: Actor = { kind: 'user', userId: 'owner-1', role: 'PATRON' };
const ADMIN: Actor = { kind: 'user', userId: 'admin-1', role: 'PATRON' };

function fakePrisma(
  opts: {
    email?: string;
    event?: unknown; // undefined → owned; null → not found
    orders?: unknown[];
    order?: unknown; // for getOrderDetail; null → not found
  } = {}
) {
  const eventsFindFirst = vi
    .fn()
    .mockResolvedValue(opts.event === undefined ? { id: 'e1' } : opts.event);
  const ordersFindMany = vi.fn().mockResolvedValue(opts.orders ?? []);
  const ordersFindFirst = vi.fn().mockResolvedValue(opts.order ?? null);

  const prisma = {
    users: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          opts.email === undefined
            ? { email: 'o@b.com' }
            : { email: opts.email }
        ),
    },
    events: { findFirst: eventsFindFirst },
    orders: { findMany: ordersFindMany, findFirst: ordersFindFirst },
  } as unknown as PrismaClient;

  return { prisma, eventsFindFirst, ordersFindMany, ordersFindFirst };
}

describe('listEventOrders', () => {
  it('rejects an anonymous actor', async () => {
    const { prisma } = fakePrisma();
    await expect(
      listEventOrders(prisma, { kind: 'anonymous' }, 'e1')
    ).rejects.toThrow(UnauthorizedError);
  });

  it('scopes orders to the acting organizer’s event', async () => {
    const { prisma, ordersFindMany } = fakePrisma();
    await listEventOrders(prisma, OWNER, 'e1');
    expect(ordersFindMany.mock.calls[0][0].where).toMatchObject({
      eventId: 'e1',
      event: { organizerUserId: 'owner-1', deletedAt: null },
    });
  });

  it('throws NotFound for an event the organizer doesn’t own', async () => {
    const { prisma } = fakePrisma({ event: null });
    await expect(listEventOrders(prisma, OWNER, 'e1')).rejects.toThrow(
      NotFoundError
    );
  });

  it('honors View-as for a platform owner', async () => {
    const { prisma, ordersFindMany } = fakePrisma({
      email: 'staff@usetroptix.com',
    });
    await listEventOrders(prisma, ADMIN, 'e1', {
      viewAsOrganizerUserId: 'target',
    });
    expect(ordersFindMany.mock.calls[0][0].where.event.organizerUserId).toBe(
      'target'
    );
  });

  it('shapes rows as amount charged + ticket count', async () => {
    const { prisma } = fakePrisma({
      orders: [
        {
          id: 'o1',
          name: null,
          email: 'buyer@x.com',
          total: 42,
          status: 'COMPLETED',
          createdAt: new Date('2026-07-14T10:00:00Z'),
          _count: { tickets: 3 },
        },
      ],
    });
    const rows = await listEventOrders(prisma, OWNER, 'e1');
    expect(rows[0]).toEqual({
      id: 'o1',
      customerDisplay: 'buyer@x.com',
      amountChargedCents: 4200,
      ticketCount: 3,
      createdAt: '2026-07-14T10:00:00.000Z',
      status: 'COMPLETED',
    });
  });
});

describe('getOrderDetail', () => {
  const order = (over: Record<string, unknown> = {}) => ({
    id: 'o1',
    status: 'COMPLETED',
    createdAt: new Date('2026-07-14T10:00:00Z'),
    name: null,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@x.com',
    telephoneNumber: '555-0100',
    cardType: 'Visa',
    cardLast4: '4242',
    subtotal: 40,
    fees: 2.5,
    total: 42.5,
    subtotalCents: 4000,
    feesCents: 250,
    totalCents: 4250,
    tickets: [
      { ticketType: { id: 't-ga', name: 'GA', price: 20 } },
      { ticketType: { id: 't-ga', name: 'GA', price: 20 } },
      { ticketType: { id: 't-vip', name: 'VIP', price: 50 } },
    ],
    ...over,
  });

  it('throws NotFound when the order isn’t under the owned event', async () => {
    const { prisma } = fakePrisma({ order: null });
    await expect(getOrderDetail(prisma, OWNER, 'e1', 'o1')).rejects.toThrow(
      NotFoundError
    );
  });

  it('groups tickets into one line item per tier', async () => {
    const { prisma } = fakePrisma({ order: order() });
    const detail = await getOrderDetail(prisma, OWNER, 'e1', 'o1');
    expect(detail.lineItems).toEqual([
      { name: 'GA', quantity: 2, unitPriceCents: 2000, subtotalCents: 4000 },
      { name: 'VIP', quantity: 1, unitPriceCents: 5000, subtotalCents: 5000 },
    ]);
  });

  it('builds the breakdown, payment method, and full name', async () => {
    const { prisma } = fakePrisma({ order: order() });
    const detail = await getOrderDetail(prisma, OWNER, 'e1', 'o1');
    expect(detail).toMatchObject({
      subtotalCents: 4000,
      feesCents: 250,
      totalCents: 4250,
      paymentMethod: 'Visa ····4242',
      customer: { name: 'Ada Lovelace', email: 'ada@x.com', phone: '555-0100' },
    });
  });

  it('falls back to the legacy float columns when the cents columns are null', async () => {
    const { prisma } = fakePrisma({
      order: order({ subtotalCents: null, feesCents: null, totalCents: null }),
    });
    const detail = await getOrderDetail(prisma, OWNER, 'e1', 'o1');
    expect(detail).toMatchObject({
      subtotalCents: 4000,
      feesCents: 250,
      totalCents: 4250,
    });
  });

  it('has no payment method for a free/legacy order and labels an unknown tier', async () => {
    const { prisma } = fakePrisma({
      order: order({
        cardType: null,
        cardLast4: null,
        tickets: [{ ticketType: null }],
      }),
    });
    const detail = await getOrderDetail(prisma, OWNER, 'e1', 'o1');
    expect(detail.paymentMethod).toBeNull();
    expect(detail.lineItems).toEqual([
      { name: 'Ticket', quantity: 1, unitPriceCents: 0, subtotalCents: 0 },
    ]);
  });
});
