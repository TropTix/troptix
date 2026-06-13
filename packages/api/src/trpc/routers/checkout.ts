import { publicProcedure, router } from '../trpc';
import {
  applyCodeInputSchema,
  checkoutConfigInputSchema,
} from '../../contracts/checkout';
import { applyCode, getCheckoutConfig } from '../../services/checkout';

/**
 * Checkout reads — thin pass-throughs to the services. Both are public (no
 * actor): the ticket list and code lookup are unauthenticated. The zod
 * contracts are the `.input`; the service return shape is the output.
 */
export const checkoutRouter = router({
  config: publicProcedure
    .input(checkoutConfigInputSchema)
    .query(({ ctx, input }) => getCheckoutConfig(ctx.prisma, input)),

  applyCode: publicProcedure
    .input(applyCodeInputSchema)
    .query(({ ctx, input }) => applyCode(ctx.prisma, input)),
});
