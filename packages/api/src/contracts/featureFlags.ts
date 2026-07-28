// Feature flag registry — the only place flag keys are written down.
// Members UPPERCASE_WITH_UNDERSCORE, values kebab-case (the PostHog key).
// One entry per in-flight initiative; removed when the flag is cleaned up.
// Lifecycle and rules: docs/runbooks/feature-flags.md.
export const FeatureFlag = {} as const;

export type FeatureFlagKey = (typeof FeatureFlag)[keyof typeof FeatureFlag];
