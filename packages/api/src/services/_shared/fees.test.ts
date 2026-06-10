/**
 * Unit tests for the fee rate card. Literal expected values (not re-derived
 * from FeeConfig), so a change to the percentage/fixed/tax — or to the rounding
 * — has to fail here rather than silently agreeing with itself.
 */
import { describe, expect, it } from 'vitest';
import { calculateFeesCents, getFeeBreakdownCents } from './fees';

describe('calculateFeesCents', () => {
  it('charges nothing for free or non-positive prices', () => {
    expect(calculateFeesCents(0)).toBe(0);
    expect(calculateFeesCents(-100)).toBe(0);
  });

  it('applies 8% + $0.50, then 15% tax, rounded to whole cents', () => {
    // 5000*0.08 + 50 = 450 base; 450 + 450*0.15 = 517.5 → round → 518.
    expect(calculateFeesCents(5000)).toBe(518);
    // 10000*0.08 + 50 = 850 base; 850 + 127.5 = 977.5 → round → 978.
    expect(calculateFeesCents(10000)).toBe(978);
    // 1*0.08 + 50 = 50.08 base; 50.08 + 7.512 = 57.592 → round → 58.
    expect(calculateFeesCents(1)).toBe(58);
  });
});

describe('getFeeBreakdownCents', () => {
  it('is all zeros for free tickets', () => {
    expect(getFeeBreakdownCents(0)).toEqual({
      baseFeeCents: 0,
      taxCents: 0,
      totalCents: 0,
    });
  });

  it('splits base + tax to sum to the charged total', () => {
    // base round(450) = 450; total = charged 518; tax = 518 - 450 = 68.
    expect(getFeeBreakdownCents(5000)).toEqual({
      baseFeeCents: 450,
      taxCents: 68,
      totalCents: 518,
    });
  });

  it('total always equals the charged fee — no display/charge drift', () => {
    // 8¢ is a case where independent rounding of base+tax would have diverged
    // (round(50.64)=51 + round(7.65)=8 = 59) from the charged 58.
    for (const priceCents of [
      1, 8, 78, 85, 155, 169, 1000, 5000, 10000, 12345,
    ]) {
      const b = getFeeBreakdownCents(priceCents);
      expect(b.totalCents).toBe(calculateFeesCents(priceCents));
      expect(b.baseFeeCents + b.taxCents).toBe(b.totalCents);
    }
  });
});
