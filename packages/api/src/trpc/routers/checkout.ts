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
  finalizePaymentInputSchema,
  getCheckoutStateInputSchema,
} from '../../contracts/payments';
import { applyCode, getCheckoutConfig } from '../../services/checkout';
import {
  createReservation,
  completeFree,
  release,
} from '../../services/reservations';
import {
  beginPayment,
  finalizePayment,
  getCheckoutState,
} from '../../services/payments';
import {
  AlreadyPaidError,
  HoldExpiredError,
  NotFoundError,
} from '../../services/_shared/errors';

// The client branches on these codes (expired screen vs. keep waiting), so
// the service errors that carry that meaning get a code rather than a 500.
function checkoutError(err: unknown): never {
  if (err instanceof NotFoundError) {
    throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof HoldExpiredError) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: err.message });
  }
  if (err instanceof AlreadyPaidError) {
    throw new TRPCError({ code: 'CONFLICT', message: err.message });
  }
  throw err;
}

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
      }).catch(checkoutError);
    }),

  finalizePayment: publicProcedure
    .input(finalizePaymentInputSchema)
    .mutation(({ ctx, input }) => {
      const { stripe } = requireStripe(ctx);
      return finalizePayment(
        ctx.prisma,
        stripe,
        { reservationId: input.reservationId },
        ctx.analytics
      ).catch(checkoutError);
    }),

  getCheckoutState: publicProcedure
    .input(getCheckoutStateInputSchema)
    .query(({ ctx, input }) =>
      getCheckoutState(ctx.prisma, {
        reservationId: input.reservationId,
      }).catch(checkoutError)
    ),
});
