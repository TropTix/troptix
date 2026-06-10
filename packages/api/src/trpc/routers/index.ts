import { createCallerFactory, router } from '../trpc';
import { checkoutRouter } from './checkout';

/**
 * The application router. New domains (events, organizer) mount here as their
 * services land. `confirm`/`expire` are intentionally NOT procedures — the
 * webhook and cron drive them directly (ADR 0007 / the service-layer plan).
 */
export const appRouter = router({
  checkout: checkoutRouter,
});

/** The router *type* — the only thing clients (web/RN) import, via `@troptix/api`. */
export type AppRouter = typeof appRouter;

/** Server-side caller (server components, tests) — bypasses HTTP. */
export const createCaller = createCallerFactory(appRouter);
