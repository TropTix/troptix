export const PORT = 3210;
export const BASE_URL = `http://localhost:${PORT}`;
export const FAKE_STRIPE_PORT = 3211;
export const FAKE_STRIPE_URL = `http://127.0.0.1:${FAKE_STRIPE_PORT}`;
export const LOCAL_DB_URL =
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable';

// The environment both `next build` and `next start` run under. Nothing here
// reaches a real third party: the Stripe SDK is pointed at the fake server,
// the keys are placeholders that only need to be non-empty, Supabase auth is a
// placeholder because nothing in the buyer flow signs in, and the PostHog key
// is blanked so the server-side order_completed capture never fires.
export function webEnv(): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    POSTGRES_PRISMA_URL: LOCAL_DB_URL,
    NEXT_PUBLIC_APP_URL: BASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'e2e-placeholder',
    NEXT_PUBLIC_POSTHOG_KEY: '',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_e2e',
    STRIPE_SECRET_KEY: 'sk_test_e2e',
    STRIPE_API_BASE: FAKE_STRIPE_URL,
    RESEND_API_KEY: 're_placeholder',
    NEXT_TELEMETRY_DISABLED: '1',
  };
}
