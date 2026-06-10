// @troptix/api/server — SERVER ENTRY.
//
// The server-side surface of the API package: the service layer (and, later,
// the tRPC router value + context). Import only from server code; the Expo app
// is lint-banned from this entry (guardrail lands with Stage 2). It does NOT
// use the `server-only` package — that throws outside RSC and would break
// Pages-Router routes / Node tooling that consume the services (see ADR 0009).
//
// The tRPC router + createContext/createCaller land in a later Stage-2 PR.

export {
  reserve,
  confirm,
  release,
  expire,
  type ReserveInput,
  type ReserveResult,
  type ReserveItemInput,
  type ReserveGrantedItem,
  type ConfirmInput,
  type ConfirmResult,
} from './services/reservations';

export { getCheckoutConfig, applyCode } from './services/checkout';
export {
  calculateFeesCents,
  getFeeBreakdownCents,
  FeeConfig,
  type FeeBreakdownCents,
} from './services/_shared/fees';
export { NotFoundError } from './services/_shared/errors';
