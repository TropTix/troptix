import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Open to anyone — public reads (checkout config, code lookup). */
export const publicProcedure = t.procedure;

/**
 * Auth tiers — the seam from ADR 0013. Supabase Auth lands in Stage 1c; until
 * then `ctx.actor` is always `anonymous`, so `protectedProcedure` rejects.
 * Establishing the tier now means authed/organizer procedures slot in later
 * without re-plumbing every router. The middleware also narrows `ctx.actor` to
 * the `user` variant for downstream resolvers.
 */
const requireUser = t.middleware(({ ctx, next }) => {
  if (ctx.actor.kind !== 'user') {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required.',
    });
  }
  return next({ ctx: { actor: ctx.actor } });
});

export const protectedProcedure = t.procedure.use(requireUser);
