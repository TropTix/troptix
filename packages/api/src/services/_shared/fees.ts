/**
 * Platform fee calculation — cents-native, for the service layer (roadmap 2.12).
 *
 * The fee is a flat **8% + $0.50** of the ticket price (no tax-on-fee). Free /
 * non-positive prices carry no fee.
 *
 * NB: this intentionally diverges from the legacy `apps/web/src/lib/fees.ts`,
 * which still applies the old 15% tax-on-fee. The legacy helper is left
 * unchanged for the un-wired legacy routes until the Stage 3 cutover; the fee
 * actually charged drops (no tax) when the app moves onto this service.
 */
export const FeeConfig = {
  PERCENTAGE: 0.08, // 8% base fee
  FIXED_CENTS: 50, // $0.50 fixed fee
} as const;

/**
 * Platform fee for a ticket price, in integer cents: `round(8% + $0.50)`.
 * Free / non-positive prices carry no fee.
 */
export function calculateFeesCents(priceCents: number): number {
  if (priceCents <= 0) return 0;
  return Math.round(priceCents * FeeConfig.PERCENTAGE + FeeConfig.FIXED_CENTS);
}
