import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Two modes, switched on E2E_BASE_URL:
//  - set (CI): run against that deployed URL; the workflow supplies
//    E2E_DATABASE_URL (preview branch) and STRIPE_SECRET_KEY.
//  - unset (local): Playwright boots `next dev` on :3210 against the local
//    Supabase stack (`supabase db start` first). Stripe test keys are read
//    from apps/web/.env below.
const remote = !!process.env.E2E_BASE_URL;
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3210';

const LOCAL_DB_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable';

if (!remote) {
  const webEnv = path.resolve(__dirname, '../apps/web/.env');
  // Fills in STRIPE_SECRET_KEY (and the publishable key next dev needs);
  // never overrides variables already set in the shell.
  if (fs.existsSync(webEnv)) process.loadEnvFile(webEnv);
  process.env.E2E_DATABASE_URL ??= LOCAL_DB_URL;
}

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // The specs share seeded inventory and assert sold/reserved deltas, so they
  // must not interleave.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: remote
    ? undefined
    : {
        command: 'yarn --cwd ../apps/web dev -p 3210',
        url: 'http://localhost:3210',
        reuseExistingServer: true,
        timeout: 180_000,
        env: {
          ...(process.env as Record<string, string>),
          POSTGRES_PRISMA_URL: LOCAL_DB_URL,
          // getAppBaseUrl() falls back to this; it becomes the Stripe
          // return_url, so it must match the port above.
          NEXT_PUBLIC_APP_URL: 'http://localhost:3210',
        },
      },
});
