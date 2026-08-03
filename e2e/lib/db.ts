import { Pool } from 'pg';

// Raw SQL on purpose: no Prisma generate step, no coupling to the client.
// The URL is the PR's Supabase preview branch in CI, the local stack otherwise.
let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const raw = process.env.E2E_DATABASE_URL;
  if (!raw) {
    throw new Error(
      'E2E_DATABASE_URL is not set — cannot verify orders in the database. ' +
        'Locally: run `supabase db start` and let playwright.config.ts default it. ' +
        'CI: the e2e workflow resolves it from the Supabase preview branch.'
    );
  }
  // Same dance as packages/db: strip sslmode so our explicit ssl config is
  // authoritative (the pooler cert chain is self-signed), except the local
  // no-SSL server where ssl must stay off.
  const url = new URL(raw);
  const disabled = url.searchParams.get('sslmode') === 'disable';
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  url.searchParams.delete('sslmode');
  pool = new Pool({
    connectionString: url.toString(),
    ssl: disabled || local ? undefined : { rejectUnauthorized: false },
    max: 2,
  });
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

export type TicketRow = { id: string; status: string; ticketsType: string };

export async function getTickets(orderId: string): Promise<TicketRow[]> {
  const { rows } = await getPool().query(
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

export async function closePool() {
  await pool?.end();
  pool = null;
}
