import {
  FINALIZE_GIVE_UP_AFTER_MS,
  FINALIZE_SLOW_AFTER_MS,
  nextFinalizeDelay,
} from './finalizeWait';

describe('nextFinalizeDelay', () => {
  it('backs off after each completed check, then holds steady', () => {
    expect([1, 2, 3, 4, 5, 20].map(nextFinalizeDelay)).toEqual([
      1_000, 2_000, 4_000, 5_000, 5_000, 5_000,
    ]);
  });

  it('never returns a zero or negative delay', () => {
    expect(nextFinalizeDelay(0)).toBeGreaterThan(0);
  });
});

describe('finalize wait ceilings', () => {
  it('shows the slow notice before giving up', () => {
    expect(FINALIZE_SLOW_AFTER_MS).toBeLessThan(FINALIZE_GIVE_UP_AFTER_MS);
  });
});
