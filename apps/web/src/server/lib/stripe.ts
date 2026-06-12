import Stripe from 'stripe';

/**
 * Single shared Stripe client for all server-side Stripe calls.
 *
 * Pinned to the API version bundled with the installed `stripe` SDK
 * (`Stripe.LatestApiVersion`), so the type matches and no `@ts-ignore` is
 * needed. Import this everywhere instead of constructing `new Stripe(...)`
 * with ad-hoc versions — divergent versions are the root of roadmap bug 1.3.
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});
