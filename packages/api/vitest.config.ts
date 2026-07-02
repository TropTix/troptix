import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Integration tests hit a real Postgres via @troptix/db, which reads the
// connection from process.env (POSTGRES_PRISMA_URL). Locally we load it from
// apps/web/.env — the canonical env location until a repo-root .env lands
// (issue #293). In CI the vars are set directly, and this no-ops if the file
// is absent.
config({
  path: fileURLToPath(new URL('../../apps/web/.env', import.meta.url)),
});

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests hit a real DB; the default 5s is too tight.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // All files share ONE Postgres, and some (expire / sweepExpiredHolds) scan
    // the whole Reservation table — running files in parallel workers would let
    // them mutate each other's rows. Run them serially instead.
    fileParallelism: false,
  },
});
