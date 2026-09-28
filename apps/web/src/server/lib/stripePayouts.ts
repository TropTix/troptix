import StripePreview from 'stripe-preview';
import type { PayoutClients } from '@troptix/api/server';
import { stripe } from './stripe';

/**
 * The Global Payouts client (ADR 0034): the public-preview SDK, pinned to the
 * preview API version that recipients and money movement require. Live calls
 * need the restricted key; a sandbox accepts the secret key.
 */
export const stripePayouts = new StripePreview(
  process.env.STRIPE_PAYOUTS_KEY ?? process.env.STRIPE_SECRET_KEY!,
  { apiVersion: '2026-08-26.preview', maxNetworkRetries: 2 }
);

export const payoutClients: PayoutClients = {
  connect: stripe,
  global: stripePayouts,
};
