// The only place flag keys are written down. Lifecycle and naming rules:
// docs/runbooks/feature-flags.md.
export const FeatureFlag = {
  ORGANIZER_PAYOUTS: 'organizer-payouts',
  STRIPE_CONNECT_ONBOARDING: 'stripe-connect-onboarding',
  GUEST_ACCESS: 'guest-access',
} as const;

export type FeatureFlagKey = (typeof FeatureFlag)[keyof typeof FeatureFlag];
