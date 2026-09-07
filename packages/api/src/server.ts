// Server entry — import only from server code. Deliberately not `server-only`:
// that throws outside RSC and breaks Pages-Router routes / Node tooling (ADR 0009).

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

export { captureOrderCompleted } from './services/reservations';

export { getCheckoutConfig, applyCode } from './services/checkout';
export { getEventDetail, listPublicEvents } from './services/events';
export { getDashboard } from './services/organizer-dashboard';
export { listOrganizerEvents } from './services/organizer-events';
export { getEventOverview } from './services/organizer-event-overview';
export {
  listEventOrders,
  getOrderDetail,
  ORDERS_LIST_LIMIT,
} from './services/organizer-orders';
export { listTicketTypes } from './services/organizer-ticket-types';
export { createEvent, updateEvent } from './services/organizer-event-write';
export {
  createTicketType,
  updateTicketType,
} from './services/organizer-ticket-type-write';
export {
  scanTicket,
  toggleTicketCheckIn,
  type ScanTicketResult,
} from './services/organizer-checkin';
export {
  ensureOrganizationForUser,
  findOrganizationForOwner,
  getOrganizationBySlug,
  updateOrganizationProfile,
} from './services/organizations';
export {
  getPayouts,
  requestPayout,
  cancelPayoutRequest,
} from './services/organizer-payouts';
export {
  listPayoutRequests,
  listPayoutOrganizations,
  resolvePayoutRequest,
  setPayoutSetupStep,
  setPayoutPolicy,
} from './services/platform-payouts';
export { calculateFeesCents, FeeConfig } from './services/_shared/fees';
export { toCents } from './services/_shared/organizerMapping';
export {
  NotFoundError,
  UnauthorizedError,
  ConflictError,
  PaidTicketingNotEnabledError,
  PayoutSetupIncompleteError,
  InvalidPayoutAmountError,
  PayoutRequestPendingError,
} from './services/_shared/errors';

export { appRouter, createCaller } from './trpc/routers';
export type { AppRouter } from './trpc/routers';
export { createContext } from './trpc/context';
export type { Context, Actor } from './trpc/context';
