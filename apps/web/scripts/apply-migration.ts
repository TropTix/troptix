/**
 * Apply pending Supabase migrations to the database you're working on.
 *
 * Usage:
 *   yarn db:apply
 *
 * Thin wrapper over `supabase db push` so the connection string is read from
 * the environment (loaded via `tsx --env-file=.env`) rather than relying on the
 * shell having it exported — same reason new-migration.ts is a script.
 *
 * Env:
 *   POSTGRES_URL_NON_POOLING  direct (5432) connection to the branch you're working on.
 *
 * ⚠️  Point this at your PR's preview branch — NOT the persistent dev branch or prod.
 *     db:apply writes; applying an unmerged migration to a shared branch will
 *     collide when the PR later merges and Supabase Branching re-applies it.
 */
import { execFileSync } from 'node:child_process';

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.error(
    "POSTGRES_URL_NON_POOLING is required (direct 5432 connection to the branch you're working on)."
  );
  process.exit(1);
}

execFileSync('supabase', ['db', 'push', '--db-url', url], { stdio: 'inherit' });
