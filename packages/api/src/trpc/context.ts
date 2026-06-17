import type { PrismaClient, Role } from '@troptix/db';

/**
 * Who is making the request (ADR 0013). Authorization is enforced in the
 * services off this value; the tRPC procedure tiers gate on it too. Real users
 * arrive once Supabase Auth lands (Stage 1c) — until then every request is
 * `anonymous`. `system` is for the webhook/cron, which bypass user checks.
 */
export type Actor =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string; role: Role }
  | { kind: 'system' };

export interface Context {
  prisma: PrismaClient;
  actor: Actor;
}

/**
 * Build the per-request context. The DB client is injected so the services stay
 * framework-agnostic. The caller resolves the actor from the request (Bearer
 * token or session cookie) and passes it in; procedures never do auth
 * themselves, they gate on ctx.actor.kind.
 */
export function createContext(opts: {
  prisma: PrismaClient;
  actor?: Actor;
}): Context {
  return { prisma: opts.prisma, actor: opts.actor ?? { kind: 'anonymous' } };
}
