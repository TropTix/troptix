import { test as base } from '@playwright/test';
import { query } from './db';

// Per-test fixture: each test creates its own Users → Organization → Event →
// TicketTypes chain with unique `e2e-` ids and deletes it afterward (fixture
// teardown runs on failure too). Mirrors the column set and delete order of
// packages/api/src/services/payments.test.ts. Isolation means assertions are
// absolute (sold === 2, not a delta) and concurrent runs against the shared
// dev database cannot race each other.

export const GA = {
  name: 'General Admission',
  description: 'Standard entry',
  priceCents: 2500,
  feesCents: 250, // round(2500 * 0.08 + 50)
  maxPerUser: 10,
};

export const VIP = {
  name: 'VIP',
  description: 'VIP entry with perks',
  priceCents: 7500,
  feesCents: 650, // round(7500 * 0.08 + 50)
  maxPerUser: 4,
};

export const EDGE = {
  nearCapacity: 'Almost Gone',
  soldOut: 'Sold Out',
  upcoming: 'Early Bird',
  gated: 'Members Only',
  gateCode: 'UNLOCK2026',
};

export const CONTACT = {
  firstName: 'E2E',
  lastName: 'Buyer',
  // Resend's test inbox: accepts every message, never bounces. A made-up
  // domain here would hard-bounce on each run and erode sender reputation.
  email: 'delivered@resend.dev',
};

export type TestTicketType = { id: string; name: string };
export type TestEvent = {
  id: string;
  name: string;
  ticketTypes: Record<string, TestTicketType>;
};

type TicketTypeInsert = {
  key: string;
  name: string;
  description: string;
  ticketType: 'PAID' | 'FREE';
  priceCents: number;
  maxPerUser: number;
  capacity: number;
  sold?: number;
  ticketingFees?: 'PASS_TICKET_FEES' | 'ABSORB_TICKET_FEES';
  saleStartsInDays?: number;
  discountCode?: string | null;
};

const DAY_MS = 86_400_000;

export class EventFactory {
  private created: { eventId: string; orgId: string; userId: string }[] = [];

  private uid(kind: string) {
    return `e2e-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async createEvent(
    name: string,
    ticketTypes: TicketTypeInsert[]
  ): Promise<TestEvent> {
    const eventId = this.uid('event');
    const orgId = this.uid('org');
    const userId = this.uid('user');
    const starts = new Date(Date.now() + 30 * DAY_MS);
    const ends = new Date(starts.getTime() + 5 * 3_600_000);

    await query(
      `insert into public."Users" (id, "createdAt", "updatedAt", email, role)
       values ($1, now(), now(), $2, 'ORGANIZER')`,
      [userId, `${userId}@troptix.test`]
    );
    await query(
      `insert into public."Organization"
         (id, "createdAt", "updatedAt", slug, "displayName", "ownerUserId", "paidTicketingEnabled")
       values ($1, now(), now(), $1, 'E2E Test Org', $2, true)`,
      [orgId, userId]
    );
    await query(
      `insert into public."Events"
         (id, "createdAt", "updatedAt", "isDraft", name, description, organizer,
          "organizerUserId", "organizationId", "startsAt", "endsAt", venue, address)
       values ($1, now(), now(), false, $2, 'Ephemeral checkout E2E fixture', 'E2E Test Org',
               $3, $4, $5, $6, 'E2E Test Hall', '1 Test Lane, Kingston')`,
      [eventId, name, userId, orgId, starts, ends]
    );

    const out: TestEvent = { id: eventId, name, ticketTypes: {} };
    for (const t of ticketTypes) {
      const insertedTicketTypeId = this.uid('ticket-type');
      const saleStarts = new Date(
        Date.now() + (t.saleStartsInDays ?? -1) * DAY_MS
      );
      await query(
        `insert into public."TicketTypes"
           (id, "ticketType", "createdAt", "updatedAt", name, description,
            "maxPurchasePerUser", capacity, reserved, sold,
            "saleStartsAt", "saleEndsAt", price, "priceCents", "ticketingFees",
            "discountCode", "eventId")
         values ($1, $2, now(), now(), $3, $4, $5, $6, 0, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          insertedTicketTypeId,
          t.ticketType,
          t.name,
          t.description,
          t.maxPerUser,
          t.capacity,
          t.sold ?? 0,
          saleStarts,
          starts,
          t.priceCents / 100,
          t.priceCents,
          t.ticketingFees ?? 'PASS_TICKET_FEES',
          t.discountCode ?? null,
          eventId,
        ]
      );
      out.ticketTypes[t.key] = { id: insertedTicketTypeId, name: t.name };
    }

    this.created.push({ eventId, orgId, userId });
    return out;
  }

  createPaidEvent() {
    return this.createEvent(`E2E Paid Festival ${Date.now()}`, [
      {
        key: 'ga',
        ...GA,
        ticketType: 'PAID',
        maxPerUser: GA.maxPerUser,
        capacity: 500,
      },
      {
        key: 'vip',
        ...VIP,
        ticketType: 'PAID',
        maxPerUser: VIP.maxPerUser,
        capacity: 50,
      },
    ]);
  }

  createFreeEvent() {
    return this.createEvent(`E2E Free Community Day ${Date.now()}`, [
      {
        key: 'rsvp',
        name: 'Free RSVP',
        description: 'Reserve a free spot',
        ticketType: 'FREE',
        priceCents: 0,
        maxPerUser: 6,
        capacity: 300,
        ticketingFees: 'ABSORB_TICKET_FEES',
      },
    ]);
  }

  createEdgeEvent() {
    return this.createEvent(`E2E Edge Cases ${Date.now()}`, [
      {
        key: 'near',
        name: EDGE.nearCapacity,
        description: 'Near-capacity ticket type',
        ticketType: 'PAID',
        priceCents: 3000,
        maxPerUser: 10,
        capacity: 100,
        sold: 98,
      },
      {
        key: 'sold',
        name: EDGE.soldOut,
        description: 'Fully sold ticket type',
        ticketType: 'PAID',
        priceCents: 4000,
        maxPerUser: 4,
        capacity: 50,
        sold: 50,
      },
      {
        key: 'soon',
        name: EDGE.upcoming,
        description: 'Sale opens next week',
        ticketType: 'PAID',
        priceCents: 2000,
        maxPerUser: 10,
        capacity: 200,
        saleStartsInDays: 7,
      },
      {
        key: 'gated',
        name: EDGE.gated,
        description: 'Members only',
        ticketType: 'PAID',
        priceCents: 6000,
        maxPerUser: 4,
        capacity: 80,
        discountCode: EDGE.gateCode,
      },
    ]);
  }

  /** Delete everything this factory created, children first. */
  async cleanup() {
    for (const { eventId, orgId, userId } of this.created.reverse()) {
      await deleteEventChain(eventId);
      await query(`delete from public."Organization" where id = $1`, [orgId]);
      await query(`delete from public."Users" where id = $1`, [userId]);
    }
    this.created = [];
  }
}

/** Same delete order as payments.test.ts; ReservationItem cascades. */
export async function deleteEventChain(eventId: string) {
  await query(`delete from public."Tickets" where "eventId" = $1`, [eventId]);
  await query(`delete from public."Orders" where "eventId" = $1`, [eventId]);
  await query(`delete from public."Reservation" where "eventId" = $1`, [
    eventId,
  ]);
  await query(`delete from public."TicketTypes" where "eventId" = $1`, [
    eventId,
  ]);
  await query(`delete from public."Events" where id = $1`, [eventId]);
}

export const test = base.extend<{ factory: EventFactory }>({
  factory: async ({}, use) => {
    const factory = new EventFactory();
    await use(factory);
    await factory.cleanup();
  },
  // Keep E2E runs out of the checkout funnel analytics. PostHog ships through
  // the app's /ingest reverse proxy, so block that path (and the direct host
  // as belt-and-braces). Server-side events still leak; accepted for now.
  page: async ({ page }, use) => {
    await page.route('**/ingest/**', (route) => route.abort());
    await page.route('https://*.posthog.com/**', (route) => route.abort());
    await use(page);
  },
});

export { expect } from '@playwright/test';
