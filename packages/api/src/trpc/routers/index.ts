import { createCallerFactory, router } from '../trpc';
import { checkoutRouter } from './checkout';
import { organizerRouter } from './organizer';
import { userRouter } from './user';

/**
 * `confirm`/`expire` are intentionally NOT procedures — only the webhook and
 * cron may drive them (ADR 0007).
 */
export const appRouter = router({
  checkout: checkoutRouter,
  organizer: organizerRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
