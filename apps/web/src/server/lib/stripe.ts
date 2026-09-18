import Stripe from 'stripe';

// Import this instead of constructing `new Stripe(...)` — ad-hoc clients with
// divergent API versions are the root of roadmap bug 1.3.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-06-24.dahlia',
});
