import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from '../trpc';
import {
  applyCodeInputSchema,
  checkoutConfigInputSchema,
  initiateCheckoutInputSchema,
  reservationStatusInputSchema,
} from '../../contracts/checkout';
import { applyCode, getCheckoutConfig } from '../../services/checkout';
import { initiateCheckout } from '../../services/initiate';
import { getReservation } from '../../services/reservations';
import { NotFoundError } from '../../services/_shared/errors';

/**
 * Checkout procedures — thin pass-throughs to the services. All public:
 * checkout supports guests (ADR 0013); when the actor is a signed-in user the
 * adapter passes the stable user id into `initiateCheckout` so the reservation
 * (and eventual order) is attached to the account. `confirm`/`expire` are
 * intentionally NOT procedures — the webhook and cron drive them (ADR 0007).
 */
export const checkoutRouter = router({
  config: publicProcedure
    .input(checkoutConfigInputSchema)
    .query(({ ctx, input }) => getCheckoutConfig(ctx.prisma, input)),

  applyCode: publicProcedure
    .input(applyCodeInputSchema)
    .query(({ ctx, input }) => applyCode(ctx.prisma, input)),

  initiate: publicProcedure
    .input(initiateCheckoutInputSchema)
    .mutation(({ ctx, input }) =>
      initiateCheckout(ctx.prisma, ctx.paymentGateway, input, {
        userId: ctx.actor.kind === 'user' ? ctx.actor.userId : null,
      })
    ),

  reservation: publicProcedure
    .input(reservationStatusInputSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getReservation(ctx.prisma, input.reservationId);
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: error.message });
        }
        throw error;
      }
    }),
});
