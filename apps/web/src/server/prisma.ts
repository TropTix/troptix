import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/**
 * Prisma 7 runtime client.
 *
 * The Rust query engine is gone — the client connects through the `pg` driver
 * adapter, and the connection URL lives here (not in schema.prisma, which v7
 * forbids). We use the pooled Supabase URL (`POSTGRES_PRISMA_URL`), matching
 * the pre-v7 runtime. See docs/plans/2026-06-prisma-7-upgrade.md for the
 * pgbouncer / SSL verification notes.
 *
 * Dev keeps a single client on `globalThis` so HMR doesn't open a new pool per
 * reload (same pattern as before, now adapter-aware).
 */
const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.POSTGRES_PRISMA_URL,
      // node-pg has no default connection timeout; Prisma v6 used 5s.
      connectionTimeoutMillis: 5000,
      // Match pre-v7 SSL behavior (the Rust engine ignored cert validation).
      ssl: { rejectUnauthorized: false },
    }),
  });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
