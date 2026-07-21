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

/**
 * The paid-checkout procedures need the injected Stripe client + app origin
 * (ADR 0018). They're optional on the context (reads/free flow and unit tests
 * don't need them), so assert them here rather than widen the whole context.
 */
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

  // Create/reuse the Checkout Session for a held paid reservation.
  beginPayment: publicProcedure
    .input(beginPaymentInputSchema)
    .mutation(({ ctx, input }) => {
      const { stripe, siteUrl } = requireStripe(ctx);
      return beginPayment(ctx.prisma, stripe, {
        reservationId: input.reservationId,
        baseUrl: siteUrl,
      });
    }),

  // Buyer-visible checkout state — drives the confirmation poll and the
  // resume-from-URL after the payment redirect (with sync fulfillment fallback).
  getCheckoutState: publicProcedure
    .input(getCheckoutStateInputSchema)
    .query(({ ctx, input }) => {
      const { stripe } = requireStripe(ctx);
      return getCheckoutState(ctx.prisma, stripe, {
        reservationId: input.reservationId,
      });
    }),
});
