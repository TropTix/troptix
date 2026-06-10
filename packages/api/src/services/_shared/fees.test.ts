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

  it('rounds the base first, then taxes the rounded base', () => {
    // base round(450) = 450; tax round(450*0.15 = 67.5) = 68; total 518.
    expect(getFeeBreakdownCents(5000)).toEqual({
      baseFeeCents: 450,
      taxCents: 68,
      totalCents: 518,
    });
  });
});
