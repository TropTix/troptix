// How the finalizing step waits for the webhook. The webhook is the guaranteed
// fulfiller (ADR 0018), so waiting is a courtesy with a ceiling, not a loop.

export const FINALIZE_SLOW_AFTER_MS = 20_000;
export const FINALIZE_GIVE_UP_AFTER_MS = 60_000;

const BACKOFF_MS = [1_000, 2_000, 4_000];
const STEADY_MS = 5_000;

/** Delay before the next status check, given how many have already completed. */
export function nextFinalizeDelay(completedChecks: number): number {
  return BACKOFF_MS[Math.max(0, completedChecks - 1)] ?? STEADY_MS;
}
