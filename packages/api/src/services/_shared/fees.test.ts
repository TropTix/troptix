/**
 * Unit tests for the fee rate card. Literal expected values (not re-derived
 * from FeeConfig), so a change to the percentage/fixed — or to the rounding —
 * has to fail here rather than silently agreeing with itself.
 */
import { describe, expect, it } from 'vitest';
import { calculateFeesCents } from './fees';

describe('calculateFeesCents', () => {
  it('charges nothing for free or non-positive prices', () => {
    expect(calculateFeesCents(0)).toBe(0);
    expect(calculateFeesCents(-100)).toBe(0);
  });

  it('applies 8% + $0.50, rounded to whole cents (no tax)', () => {
    expect(calculateFeesCents(5000)).toBe(450); // 5000*0.08 + 50 = 450
    expect(calculateFeesCents(10000)).toBe(850); // 800 + 50
    expect(calculateFeesCents(1)).toBe(50); // round(50.08) = 50
  });
});
