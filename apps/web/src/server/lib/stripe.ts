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

/**
 * Stripe API version used when minting ephemeral keys for the mobile app.
 *
 * This must match the Stripe SDK version embedded in the mobile client, NOT
 * the server API version above — do not unify it with `stripe`'s apiVersion.
 * Confirm against the mobile app's Stripe SDK before changing.
 */
export const MOBILE_STRIPE_API_VERSION = '2020-08-27';
