import { TRPCError } from '@trpc/server';
import { publicProcedure, router } from '../trpc';
import type { Context } from '../context';
import {
  applyCodeInputSchema,
  checkoutConfigInputSchema,
} from '../../contracts/checkout';
import {
  createReservationInputSchema,
  completeFreeInputSchema,
  releaseInputSchema,
} from '../../contracts/reservations';
import {
  beginPaymentInputSchema,
  getCheckoutStateInputSchema,
} from '../../contracts/payments';
import { applyCode, getCheckoutConfig } from '../../services/checkout';
import {
  createReservation,
  completeFree,
  release,
} from '../../services/reservations';
import { beginPayment, getCheckoutState } from '../../services/payments';

function requireStripe(ctx: Context): {
  stripe: NonNullable<Context['stripe']>;
  siteUrl: string;
} {
  if (!ctx.stripe || !ctx.siteUrl) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Stripe is not configured for this request.',
    });
  }
  return { stripe: ctx.stripe, siteUrl: ctx.siteUrl };
}

/**
 * The commit mutations are deliberately public: a guest authorizes by possession
 * of the unguessable `reservationId`; `userId` comes from `ctx.actor`, never the client.
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
    .mutation(({ ctx, input }) =>
      completeFree(ctx.prisma, input, ctx.analytics)
    ),

  release: publicProcedure
    .input(releaseInputSchema)
    .mutation(({ ctx, input }) => release(ctx.prisma, input.reservationId)),

  beginPayment: publicProcedure
    .input(beginPaymentInputSchema)
    .mutation(({ ctx, input }) => {
      const { stripe, siteUrl } = requireStripe(ctx);
      return beginPayment(ctx.prisma, stripe, {
        reservationId: input.reservationId,
        baseUrl: siteUrl,
      });
    }),

  getCheckoutState: publicProcedure
    .input(getCheckoutStateInputSchema)
    .query(({ ctx, input }) => {
      const { stripe } = requireStripe(ctx);
      return getCheckoutState(
        ctx.prisma,
        stripe,
        { reservationId: input.reservationId },
        ctx.analytics
      );
    }),
});
