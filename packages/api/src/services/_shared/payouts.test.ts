import { describe, expect, it } from 'vitest';
import { PayoutConfig, releaseEarnings, resolvePayoutPolicy } from './payouts';

const NOW = new Date('2026-09-01T12:00:00Z');
const DEFAULTS = resolvePayoutPolicy({
  payoutReleaseAtSale: false,
  payoutHoldbackPercent: null,
  payoutHoldbackDays: null,
});

const daysFromNow = (days: number) =>
  new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

describe('resolvePayoutPolicy', () => {
  it('falls back to the platform defaults', () => {
    expect(DEFAULTS).toEqual({
      holdbackPercent: PayoutConfig.HOLDBACK_PERCENT,
      holdbackDays: PayoutConfig.HOLDBACK_DAYS,
      releaseAtSale: false,
    });
  });

  it('honors per-organization overrides, including zero', () => {
    expect(
      resolvePayoutPolicy({
        payoutReleaseAtSale: true,
        payoutHoldbackPercent: 0,
        payoutHoldbackDays: 5,
      })
    ).toEqual({ holdbackPercent: 0, holdbackDays: 5, releaseAtSale: true });
  });
});

describe('releaseEarnings', () => {
  it('keeps everything pending before the event ends', () => {
    expect(releaseEarnings(10000, daysFromNow(3), DEFAULTS, NOW)).toEqual({
      releasedCents: 0,
      pendingCents: 10000,
    });
  });

  it('releases all but the holdback once the event ends', () => {
    expect(releaseEarnings(10000, daysFromNow(-1), DEFAULTS, NOW)).toEqual({
      releasedCents: 8000,
      pendingCents: 2000,
    });
  });

  it('still holds back on the last day of the window', () => {
    const almostOver = new Date(NOW.getTime() - (20 * 24 * 60 * 60 * 1000 - 1));
    expect(releaseEarnings(10000, almostOver, DEFAULTS, NOW)).toEqual({
      releasedCents: 8000,
      pendingCents: 2000,
    });
  });

  it('releases the holdback once the window elapses', () => {
    expect(releaseEarnings(10000, daysFromNow(-20), DEFAULTS, NOW)).toEqual({
      releasedCents: 10000,
      pendingCents: 0,
    });
  });

  it('releases before event end under releaseAtSale, holdback intact', () => {
    const policy = { ...DEFAULTS, releaseAtSale: true };
    expect(releaseEarnings(10000, daysFromNow(30), policy, NOW)).toEqual({
      releasedCents: 8000,
      pendingCents: 2000,
    });
  });

  it('never counts a future event end as an elapsed holdback window', () => {
    const policy = { ...DEFAULTS, releaseAtSale: true, holdbackDays: 0 };
    // Window is zero days, but it can't elapse before the event ends.
    expect(releaseEarnings(10000, daysFromNow(30), policy, NOW)).toEqual({
      releasedCents: 8000,
      pendingCents: 2000,
    });
  });

  it('applies a custom holdback percent', () => {
    const policy = { ...DEFAULTS, holdbackPercent: 50 };
    expect(releaseEarnings(999, daysFromNow(-1), policy, NOW)).toEqual({
      releasedCents: 499,
      pendingCents: 500,
    });
  });

  it('a zero holdback releases everything at event end', () => {
    const policy = { ...DEFAULTS, holdbackPercent: 0, holdbackDays: 0 };
    expect(releaseEarnings(10000, daysFromNow(-0.5), policy, NOW)).toEqual({
      releasedCents: 10000,
      pendingCents: 0,
    });
  });
});
