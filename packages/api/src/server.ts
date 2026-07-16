// @troptix/api/server — SERVER ENTRY.
//
// The server-side surface of the API package: the service layer + the tRPC
// router value, context, and caller. Import only from server code; the Expo
// app is lint-banned from this entry (guardrail lands with Stage 2). It does
// NOT use the `server-only` package — that throws outside RSC and would break
// Pages-Router routes / Node tooling that consume the services (see ADR 0009).

export {
  reserve,
  createReservation,
  confirm,
  settle,
  completeFree,
  release,
  expire,
  expireHold,
  type ReserveInput,
  type ReserveResult,
  type ReserveItemInput,
  type ReserveGrantedItem,
  type ConfirmInput,
  type ConfirmResult,
  type SettleInput,
  type SettleResult,
} from './services/reservations';

export {
  beginPayment,
  confirmPaid,
  getCheckoutState,
  sweepExpiredHolds,
  type SweepResult,
} from './services/payments';

export { getCheckoutConfig, applyCode } from './services/checkout';
export { getEventDetail, listPublicEvents } from './services/events';
export { getDashboard } from './services/organizer-dashboard';
export {
  ensureOrganizationForUser,
  backfillOrganizations,
  getOrganizationBySlug,
  updateOrganizationProfile,
} from './services/organizations';
export { calculateFeesCents, FeeConfig } from './services/_shared/fees';
export { NotFoundError, UnauthorizedError } from './services/_shared/errors';

// tRPC adapter — router value, server-side caller, and per-request context.
export { appRouter, createCaller } from './trpc/routers';
export type { AppRouter } from './trpc/routers';
export { createContext } from './trpc/context';
export type { Context, Actor } from './trpc/context';
