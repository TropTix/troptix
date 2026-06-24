import type { PrismaClient, Role } from '@troptix/db';
import type { PaymentGateway } from '../services/payments';

/**
 * Who is making the request (ADR 0013). Authorization is enforced in the
 * services off this value; the tRPC procedure tiers gate on it too. Supabase
 * Auth is live (Stage 1c); the web adapter resolves the request → `actor`
 * (Bearer token or session cookie). `system` is for the webhook/cron, which
 * bypass user checks.
 */
export type Actor =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string; role: Role }
  | { kind: 'system' };

export interface Context {
  prisma: PrismaClient;
  actor: Actor;
  /**
   * Payment port for `checkout.initiate` (Stage 3 plan). Injected by the
   * adapter — `apps/web` passes its Stripe-backed implementation; tests pass a
   * fake — so the package never imports Stripe.
   */
  paymentGateway: PaymentGateway;
}

/**
 * Build the per-request context. The DB client and payment gateway are injected
 * so the services stay framework-agnostic. The caller resolves the actor from
 * the request (Bearer token or session cookie) and passes it in; procedures
 * never do auth themselves, they gate on `ctx.actor.kind`.
 */
export function createContext(opts: {
  prisma: PrismaClient;
  actor?: Actor;
  paymentGateway: PaymentGateway;
}): Context {
  return {
    prisma: opts.prisma,
    actor: opts.actor ?? { kind: 'anonymous' },
    paymentGateway: opts.paymentGateway,
  };
}
