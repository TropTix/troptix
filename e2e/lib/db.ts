import { Pool } from 'pg';

// Raw SQL on purpose: no Prisma generate step, no coupling to the client.
let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const raw = process.env.E2E_DATABASE_URL;
  if (!raw) {
    throw new Error(
      'E2E_DATABASE_URL is not set. Run `supabase db start` and let playwright.config.ts default it.'
    );
  }
  pool = new Pool({ connectionString: raw, max: 4 });
  return pool;
}

export async function query(sql: string, params: unknown[] = []) {
  return getPool().query(sql, params);
}

async function one<T>(sql: string, params: unknown[]): Promise<T | null> {
  const { rows } = await query(sql, params);
  return (rows[0] as T) ?? null;
}

export type OrderRow = {
  id: string;
  status: string;
  type: string;
  stripePaymentId: string | null;
  totalCents: number;
  subtotalCents: number;
  feesCents: number;
  email: string | null;
};

export function getOrder(orderId: string) {
  return one<OrderRow>(
    'select id, status, type, "stripePaymentId", "totalCents", "subtotalCents", "feesCents", email from public."Orders" where id = $1',
    [orderId]
  );
}

export async function countOrdersForEvent(eventId: string): Promise<number> {
  const row = await one<{ n: string }>(
    'select count(*)::text as n from public."Orders" where "eventId" = $1',
    [eventId]
  );
  return Number(row?.n ?? 0);
}

export type TicketRow = { id: string; status: string; ticketsType: string };

export async function getTickets(orderId: string): Promise<TicketRow[]> {
  const { rows } = await query(
    'select id, status, "ticketsType" from public."Tickets" where "orderId" = $1',
    [orderId]
  );
  return rows as TicketRow[];
}

export type ReservationRow = {
  id: string;
  status: string;
  stripePaymentIntentId: string | null;
};

export function getReservation(reservationId: string) {
  return one<ReservationRow>(
    'select id, status, "stripePaymentIntentId" from public."Reservation" where id = $1',
    [reservationId]
  );
}

export function getReservationForOrder(orderId: string) {
  return one<ReservationRow>(
    'select id, status, "stripePaymentIntentId" from public."Reservation" where "orderId" = $1',
    [orderId]
  );
}

export type Inventory = { capacity: number; reserved: number; sold: number };

export async function getInventory(ticketTypeId: string): Promise<Inventory> {
  const row = await one<Inventory>(
    'select capacity, reserved, sold from public."TicketTypes" where id = $1',
    [ticketTypeId]
  );
  if (!row) throw new Error(`TicketTypes row ${ticketTypeId} not found`);
  return row;
}
