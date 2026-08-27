import type { PrismaClient, Role } from '@troptix/db';
import type Stripe from 'stripe';
import type { CheckoutAnalytics } from '../contracts/analytics';

/**
 * Authorization is enforced in the services off this value (ADR 0013).
 * `system` is for the webhook/cron only — it bypasses user checks.
 */
export type Actor =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string; role: Role }
  | { kind: 'system' };

export interface Context {
  prisma: PrismaClient;
  actor: Actor;
  stripe?: Stripe;
  siteUrl?: string;
  /** Missing means analytics is off — captures are silently skipped. */
  analytics?: CheckoutAnalytics;
}

export function createContext(opts: {
  prisma: PrismaClient;
  actor?: Actor;
  stripe?: Stripe;
  siteUrl?: string;
  analytics?: CheckoutAnalytics;
}): Context {
  return {
    prisma: opts.prisma,
    actor: opts.actor ?? { kind: 'anonymous' },
    stripe: opts.stripe,
    siteUrl: opts.siteUrl,
    analytics: opts.analytics,
  };
}
