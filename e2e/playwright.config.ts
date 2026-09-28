import { defineConfig, devices } from '@playwright/test';
import {
  BASE_URL,
  FAKE_STRIPE_URL,
  LOCAL_DB_URL,
  PORT,
  webEnv,
} from './lib/env';

process.env.E2E_DATABASE_URL ??= LOCAL_DB_URL;

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ...(process.env.CI ? [['github'] as const] : []),
  ],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    video: {
      mode: 'retain-on-failure',
      size: { width: 1280, height: 720 },
      show: {
        actions: { position: 'bottom-left', fontSize: 18 },
        test: { level: 'title', position: 'top', fontSize: 18 },
      },
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'tsx scripts/fake-stripe.ts',
      url: `${FAKE_STRIPE_URL}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm --filter web start -p ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: webEnv(),
    },
  ],
});
