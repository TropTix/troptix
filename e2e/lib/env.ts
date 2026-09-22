import fs from 'node:fs';
import path from 'node:path';

export const PORT = 3210;
export const BASE_URL = `http://localhost:${PORT}`;
export const LOCAL_DB_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable';

const webEnvFile = path.resolve(__dirname, '../../apps/web/.env');

// Stripe test keys live in apps/web/.env locally and in repo secrets on CI.
// Never overrides variables already set in the shell.
export function loadWebEnvFile() {
  if (fs.existsSync(webEnvFile)) process.loadEnvFile(webEnvFile);
}

// The environment both `next build` and `next start` run under. The Supabase
// values are placeholders: nothing in the buyer flow signs in, and the
// session-refresh proxy never calls out without a session cookie. The Stripe
// and Resend clients throw at construction without a key, which fails the
// build; placeholders keep it building when the real keys are absent (paid
// specs skip on the missing keys, and no email can leave). The PostHog key is
// blanked so the server-side order_completed capture never reaches the real
// project from a test run.
export function webEnv(): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    POSTGRES_PRISMA_URL: LOCAL_DB_URL,
    NEXT_PUBLIC_APP_URL: BASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'e2e-placeholder',
    NEXT_PUBLIC_POSTHOG_KEY: '',
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
    RESEND_API_KEY: process.env.RESEND_API_KEY || 're_placeholder',
    NEXT_TELEMETRY_DISABLED: '1',
  };
}
