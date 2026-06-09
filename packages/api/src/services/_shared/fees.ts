/**
 * Platform fee calculation — cents-native port of `apps/web/src/lib/fees.ts`.
 *
 * The service layer works in integer cents end-to-end (roadmap 2.12), so these
 * take and return cents rather than the legacy dollar `Float`s. Same rate card
 * (8% + $0.50, then 15% tax on the fee) as the legacy helper, so a given price
 * yields the same fee — just expressed in cents. The legacy dollar version is
 * retained in `apps/web` for the un-wired legacy routes until Stage 3.
 */
export const FeeConfig = {
  PERCENTAGE: 0.08, // 8% base fee
  FIXED_CENTS: 50, // $0.50 fixed fee
  TAX_RATE: 0.15, // 15% tax on fees
} as const;

export interface FeeBreakdownCents {
  baseFeeCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Total fee (base + tax) for a ticket price, in integer cents.
 * Free tickets carry no fee.
 */
/** The unrounded base fee (percentage + fixed) in cents — the rate-card formula. */
function rawBaseFeeCents(priceCents: number): number {
  return priceCents * FeeConfig.PERCENTAGE + FeeConfig.FIXED_CENTS;
}

export function calculateFeesCents(priceCents: number): number {
  if (priceCents <= 0) return 0;

  const baseFee = rawBaseFeeCents(priceCents);
  return Math.round(baseFee + baseFee * FeeConfig.TAX_RATE);
}

/** Detailed fee breakdown (base / tax / total) in integer cents, for display. */
export function getFeeBreakdownCents(priceCents: number): FeeBreakdownCents {
  if (priceCents <= 0) {
    return { baseFeeCents: 0, taxCents: 0, totalCents: 0 };
  }

  const baseFeeCents = Math.round(rawBaseFeeCents(priceCents));
  const taxCents = Math.round(baseFeeCents * FeeConfig.TAX_RATE);
  return { baseFeeCents, taxCents, totalCents: baseFeeCents + taxCents };
}
