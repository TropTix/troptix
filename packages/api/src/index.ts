// RN-safe default entry. Never re-export the router value, services, or anything
// transitively importing @troptix/db — `AppRouter` leaves as an erased type only.
export * from './contracts';
export type { AppRouter } from './trpc/routers';

// Fee math is a pure module (no imports, no DB) — the one service export that
// is safe on this entry.
export { calculateFeesCents, FeeConfig } from './services/_shared/fees';
