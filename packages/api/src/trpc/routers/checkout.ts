import { publicProcedure, router } from '../trpc';
import {
  applyCodeInputSchema,
  checkoutConfigInputSchema,
} from '../../contracts/checkout';
import {
  createReservationInputSchema,
  completeFreeInputSchema,
  releaseInputSchema,
} from '../../contracts/reservations';
import { applyCode, getCheckoutConfig } from '../../services/checkout';
import {
  createReservation,
  completeFree,
  release,
} from '../../services/reservations';

/**
 * Checkout procedures — thin pass-throughs to the services. Reads are public
 * (unauthenticated ticket list / code lookup). The commit mutations are public
 * too: a guest authorizes by possession of the unguessable `reservationId`, and
 * the buyer's `userId` is taken from `ctx.actor`, never the client.
 */
export const checkoutRouter = router({
  config: publicProcedure
    .input(checkoutConfigInputSchema)
    .query(({ ctx, input }) => getCheckoutConfig(ctx.prisma, input)),

  applyCode: publicProcedure
    .input(applyCodeInputSchema)
    .query(({ ctx, input }) => applyCode(ctx.prisma, input)),

  createReservation: publicProcedure
    .input(createReservationInputSchema)
    .mutation(({ ctx, input }) =>
      createReservation(
        ctx.prisma,
        input,
        ctx.actor.kind === 'user' ? ctx.actor.userId : null
      )
    ),

  completeFree: publicProcedure
    .input(completeFreeInputSchema)
    .mutation(({ ctx, input }) => completeFree(ctx.prisma, input)),

  // Hand a held reservation's inventory back (e.g. the buyer abandons or the
  // commit fails after the hold was taken).
  release: publicProcedure
    .input(releaseInputSchema)
    .mutation(({ ctx, input }) => release(ctx.prisma, input.reservationId)),
});
