import { protectedProcedure, router } from '../trpc';
import { getProfile } from '../../services/user';
import { TRPCError } from '@trpc/server';

export const userRouter = router({
  /**
   * The current user's full profile (fetched from the database).
   * Aligns with what the web app currently fetches via /api/user/me.
   */
  profile: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await getProfile(ctx.prisma, ctx.actor);
    } catch (e: any) {
      if (e.message === 'UNAUTHORIZED') {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      if (e.message === 'NOT_FOUND') {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: e.message,
      });
    }
  }),
});
