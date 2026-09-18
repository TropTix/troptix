// Server entry (client/RN code imports type-only '@troptix/db/types'). No
// `server-only` on purpose: it throws outside RSC, breaking Pages-Router API
// routes and Node tests; the quarantine is the two-entry split + ESLint ban.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

// Strip `sslmode` so the explicit `ssl` object stays authoritative — a URL-borne
// sslmode (Supabase Vercel previews inject one) re-enables cert validation and
// rejects Supabase's self-signed pooler cert. `sslmode=disable` alone is honored:
// local/CI Supabase has no SSL, and `pg` with truthy `ssl` aborts there.
const parseConnection = () => {
  const raw = process.env.POSTGRES_PRISMA_URL;
  const sslDefault = { rejectUnauthorized: false } as const;
  if (!raw) return { connectionString: raw, ssl: sslDefault };
  try {
    const url = new URL(raw);
    const sslDisabled = url.searchParams.get('sslmode') === 'disable';
    url.searchParams.delete('sslmode');
    return {
      connectionString: url.toString(),
      ssl: sslDisabled ? (false as const) : sslDefault,
    };
  } catch {
    return { connectionString: raw, ssl: sslDefault };
  }
};

// instances × max is what the pooler's max_client_conn absorbs — cap well under
// pg's default 10. Invalid PG_POOL_MAX falls back to 5 (pg-pool turns 0/NaN into 10).
const poolMax = () => {
  const parsed = Number(process.env.PG_POOL_MAX);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 5;
};

const createPrismaClient = () => {
  const { connectionString, ssl } = parseConnection();
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: poolMax(),
      // Supabase pgbouncer drops idle connections after ~30s — stay under it or
      // the pool hands out dead sockets ("Connection terminated unexpectedly").
      idleTimeoutMillis: 20000,
      // Give Supabase free-tier enough time to wake a cold pooler connection.
      connectionTimeoutMillis: 15000,
      ssl,
    }),
    // The default 5s interactive-transaction budget (wall-clock across the whole
    // callback) gets blown by pooler latency spikes — "commit cannot be executed
    // on an expired transaction", stranding a settled payment without its order.
    transactionOptions: {
      maxWait: 10000,
      timeout: 15000,
    },
  });
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
export { prisma };

export * from './generated/prisma/client';
