/**
 * Flat 8% + $0.50, no tax-on-fee — intentionally diverges from the legacy
 * `apps/web/src/lib/fees.ts` (15% tax-on-fee); do not "sync" the two.
 */
export const FeeConfig = {
  PERCENTAGE: 0.08,
  FIXED_CENTS: 50,
} as const;

export function calculateFeesCents(priceCents: number): number {
  if (priceCents <= 0) return 0;
  return Math.round(priceCents * FeeConfig.PERCENTAGE + FeeConfig.FIXED_CENTS);
}
