import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Integration tests need POSTGRES_PRISMA_URL; locally it lives in apps/web/.env
// (the canonical env location, issue #293). No-ops when the file is absent (CI).
config({
  path: fileURLToPath(new URL('../../apps/web/.env', import.meta.url)),
});

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // All files share ONE Postgres, and some (expire / sweepExpiredHolds) scan the
    // whole Reservation table — parallel workers would mutate each other's rows.
    fileParallelism: false,
  },
});
