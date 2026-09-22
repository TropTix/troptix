import { query } from './db';

// Per-test fixture: each test creates its own Users → Organization → Event →
// TicketTypes chain with unique `e2e-` ids and deletes it afterward. Isolation
// makes every assertion absolute (sold === 2, not a delta) and lets specs run
// in parallel against one database.

export const GA = {
  name: 'General Admission',
  description: 'Standard entry',
  priceCents: 2500,
  feesCents: 250,
  maxPerUser: 10,
};

export const VIP = {
  name: 'VIP',
  description: 'VIP entry with perks',
  priceCents: 7500,
  feesCents: 650,
  maxPerUser: 4,
};

export const EDGE = {
  nearCapacity: 'Almost Gone',
  soldOut: 'Sold Out',
  upcoming: 'Early Bird',
  gated: 'Members Only',
  gateCode: 'UNLOCK2026',
};

export const BUYER = {
  firstName: 'Test',
  lastName: 'Buyer',
  // Resend's sink address: accepted, never bounced, never delivered.
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
         (id, "createdAt", "updatedAt", "isDraft", "isPrivate", name, description, organizer,
          "organizerUserId", "organizationId", "startsAt", "endsAt", venue, address, country, "countryCode")
       values ($1, now(), now(), false, false, $2, 'Ephemeral checkout E2E fixture', 'E2E Test Org',
               $3, $4, $5, $6, 'E2E Test Hall', '1 Test Lane, Kingston', 'Jamaica', 'JM')`,
      [eventId, name, userId, orgId, starts, ends]
    );

    const out: TestEvent = { id: eventId, name, ticketTypes: {} };
    for (const t of ticketTypes) {
      const id = this.uid('ticket-type');
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
          id,
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
      out.ticketTypes[t.key] = { id, name: t.name };
    }

    this.created.push({ eventId, orgId, userId });
    return out;
  }

  createPaidEvent() {
    return this.createEvent(`E2E Paid Festival ${Date.now()}`, [
      { key: 'ga', ...GA, ticketType: 'PAID', capacity: 500 },
      { key: 'vip', ...VIP, ticketType: 'PAID', capacity: 50 },
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

  async cleanup() {
    for (const { eventId, orgId, userId } of this.created.reverse()) {
      await deleteEventChain(eventId);
      await query(`delete from public."Organization" where id = $1`, [orgId]);
      await query(`delete from public."Users" where id = $1`, [userId]);
    }
    this.created = [];
  }
}

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
