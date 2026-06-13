// @troptix/db — SERVER ENTRY.
//
// Owns the Prisma 7 runtime: the generated client + the `pg` driver adapter.
// Import only from server code.
//
// NB: we deliberately do NOT use the `server-only` package here. It throws
// outside a React-Server-Components context, which would break the repo's
// Pages-Router API routes (src/pages/api/*) and Node tooling/tests that
// legitimately use the DB — it's an App-Router-only guard, too blunt for a DB
// package consumed across mixed runtimes. The client/RN quarantine is instead
// enforced by the two-entry split (clients import the type-only
// `@troptix/db/types`) + the ESLint no-restricted-imports ban on this entry in
// apps/organizer (Stage 2).
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

/**
 * Prisma 7 runtime client (moved here from apps/web in the packages/db
 * relocation). The Rust engine is gone — the client connects through the `pg`
 * driver adapter, with the connection URL read from the environment of the
 * consuming app (Next provides `POSTGRES_PRISMA_URL`, pooled). See
 * docs/plans/2026-06-prisma-7-upgrade.md for the pgbouncer / SSL notes.
 *
 * A single client is cached on `globalThis` in dev so HMR doesn't open a new
 * pool per reload.
 */

/**
 * Strip `sslmode` from the connection string so the adapter's `ssl` config below
 * is authoritative. When `sslmode` is present, `pg-connection-string` parses it
 * into its own ssl settings that can override the explicit `ssl` object, which
 * re-enables cert validation and rejects Supabase's self-signed pooler cert
 * ("self-signed certificate in certificate chain"). Some envs (e.g. the Supabase
 * Vercel integration's preview branches) inject `sslmode`; our hand-set prod URL
 * does not, so this is a no-op there.
 */
const connectionString = () => {
  const raw = process.env.POSTGRES_PRISMA_URL;
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return raw;
  }
};

const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: connectionString(),
      // node-pg has no default connection timeout; Prisma v6 used 5s.
      connectionTimeoutMillis: 5000,
      // SSL is governed here (the Rust engine ignored cert validation pre-v7);
      // see connectionString() for why sslmode is stripped from the URL.
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
export { prisma };

// Re-export the generated client's surface (PrismaClient, the `Prisma`
// namespace, enums, model types) so server consumers import everything from
// `@troptix/db` rather than reaching into the generated output directly.
export * from './generated/prisma/client';
