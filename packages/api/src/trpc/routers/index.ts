import { createCallerFactory, router } from '../trpc';
import { checkoutRouter } from './checkout';
import { organizerRouter } from './organizer';
import { userRouter } from './user';

/**
 * The application router. `confirm`/`expire` are intentionally NOT procedures
 * — the webhook and cron drive them directly (ADR 0007 / the service-layer plan).
 */
export const appRouter = router({
  checkout: checkoutRouter,
  organizer: organizerRouter,
  user: userRouter,
});

/** The router *type* — the only thing clients (web/RN) import, via `@troptix/api`. */
export type AppRouter = typeof appRouter;

/** Server-side caller (server components, tests) — bypasses HTTP. */
export const createCaller = createCallerFactory(appRouter);
