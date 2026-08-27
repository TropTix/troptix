// Literal expected values, never re-derived from FeeConfig — a changed rate,
// fixed fee, or rounding must fail here rather than silently agree with itself.
import { describe, expect, it } from 'vitest';
import { calculateFeesCents } from './fees';

describe('calculateFeesCents', () => {
  it('charges nothing for free or non-positive prices', () => {
    expect(calculateFeesCents(0)).toBe(0);
    expect(calculateFeesCents(-100)).toBe(0);
  });

  it('applies 8% + $0.50, rounded to whole cents (no tax)', () => {
    expect(calculateFeesCents(5000)).toBe(450);
    expect(calculateFeesCents(10000)).toBe(850);
    expect(calculateFeesCents(1)).toBe(50);
    expect(calculateFeesCents(1049)).toBe(134); // round(133.92) = 134, floor would give 133
  });
});
