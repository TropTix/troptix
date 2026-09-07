/**
 * Platform defaults for the payout release rule: 20% of an event's earnings
 * held for 20 days after the event ends (ADR 0028). Per-Organization overrides
 * live on the Organization row; null falls back to these.
 */
export const PayoutConfig = {
  HOLDBACK_PERCENT: 20,
  HOLDBACK_DAYS: 20,
} as const;

export interface PayoutPolicy {
  holdbackPercent: number;
  holdbackDays: number;
  /** Release earnings as orders complete, before the event ends. */
  releaseAtSale: boolean;
}

export interface PayoutPolicyColumns {
  payoutReleaseAtSale: boolean;
  payoutHoldbackPercent: number | null;
  payoutHoldbackDays: number | null;
}

export function resolvePayoutPolicy(org: PayoutPolicyColumns): PayoutPolicy {
  return {
    holdbackPercent: org.payoutHoldbackPercent ?? PayoutConfig.HOLDBACK_PERCENT,
    holdbackDays: org.payoutHoldbackDays ?? PayoutConfig.HOLDBACK_DAYS,
    releaseAtSale: org.payoutReleaseAtSale,
  };
}

/**
 * Split one event's earnings into released and still-pending cents. The
 * holdback anchors to event end even under releaseAtSale, so paying during
 * the sale never shortens the holdback window.
 */
export function releaseEarnings(
  earnedCents: number,
  endsAt: Date,
  policy: PayoutPolicy,
  now: Date
): { releasedCents: number; pendingCents: number } {
  const ended = endsAt.getTime() <= now.getTime();
  const holdbackOver =
    ended &&
    now.getTime() - endsAt.getTime() >=
      policy.holdbackDays * 24 * 60 * 60 * 1000;

  if (holdbackOver) {
    return { releasedCents: earnedCents, pendingCents: 0 };
  }
  if (ended || policy.releaseAtSale) {
    const held = Math.round((earnedCents * policy.holdbackPercent) / 100);
    return { releasedCents: earnedCents - held, pendingCents: held };
  }
  return { releasedCents: 0, pendingCents: earnedCents };
}
