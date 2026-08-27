import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

export const publicProcedure = t.procedure;

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
