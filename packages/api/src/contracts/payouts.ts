import { z } from 'zod';
import { viewAsInputSchema } from './organizer';

export const payoutRequestStatusSchema = z.enum([
  'REQUESTED',
  'CANCELLED',
  'REJECTED',
  'PAID',
]);
export type PayoutRequestStatusDto = z.infer<typeof payoutRequestStatusSchema>;

export const payoutRailSchema = z.enum(['MERCURY', 'STRIPE', 'OTHER']);
export type PayoutRailDto = z.infer<typeof payoutRailSchema>;

/** Which shape the Organization's Stripe account is (ADR 0034). */
export const stripeAccountKindSchema = z.enum(['CONNECT', 'GLOBAL_PAYOUTS']);
export type StripeAccountKind = z.infer<typeof stripeAccountKindSchema>;

/**
 * The Organization's Stripe account as last mirrored from Stripe (ADR 0032).
 * `manual` = no account.
 */
export const connectStateSchema = z.enum([
  'manual',
  'in_progress',
  'pending',
  'active',
  'needs_updates',
]);
export type ConnectState = z.infer<typeof connectStateSchema>;

export const connectSetupSchema = z.object({
  accountId: z.string().nullable(),
  kind: stripeAccountKindSchema.nullable(),
  state: connectStateSchema,
});
export type ConnectSetup = z.infer<typeof connectSetupSchema>;

export const startGlobalPayoutsOnboardingInputSchema = z.object({
  country: z.string().length(2),
  entityType: z.enum(['individual', 'company']),
});
export type StartGlobalPayoutsOnboardingInput = z.infer<
  typeof startGlobalPayoutsOnboardingInputSchema
>;

export const connectReturnOutcomeSchema = z.enum([
  'active',
  'pending',
  'incomplete',
]);
export type ConnectReturnOutcome = z.infer<typeof connectReturnOutcomeSchema>;

export const payoutSetupStateSchema = z.object({
  meetingDone: z.boolean(),
  bankLinked: z.boolean(),
  /** True only for the current terms version. */
  termsAccepted: z.boolean(),
  termsAcceptedAt: z.string().datetime().nullable(),
  complete: z.boolean(),
});
export type PayoutSetupState = z.infer<typeof payoutSetupStateSchema>;

export const payoutTermsSchema = z.object({
  version: z.string().min(1),
  effective: z.string().min(1),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
});
export type PayoutTerms = z.infer<typeof payoutTermsSchema>;

export const acceptPayoutTermsInputSchema = z.object({
  version: z.string().min(1),
});
export type AcceptPayoutTermsInput = z.infer<
  typeof acceptPayoutTermsInputSchema
>;

/** The org's effective release rule — overrides already folded in. */
export const payoutPolicySchema = z.object({
  holdbackPercent: z.number().int().min(0).max(100),
  holdbackDays: z.number().int().min(0),
  releaseAtSale: z.boolean(),
});
export type PayoutPolicyDto = z.infer<typeof payoutPolicySchema>;

export const organizerPayoutRequestSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  status: payoutRequestStatusSchema,
  amountCents: z.number().int(),
  note: z.string().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  rail: payoutRailSchema.nullable(),
  reference: z.string().nullable(),
  adminNote: z.string().nullable(),
});
export type OrganizerPayoutRequest = z.infer<
  typeof organizerPayoutRequestSchema
>;

export const organizerPayoutsSchema = z.object({
  availableCents: z.number().int(),
  pendingCents: z.number().int(),
  paidOutCents: z.number().int(),
  setup: payoutSetupStateSchema,
  policy: payoutPolicySchema,
  requests: z.array(organizerPayoutRequestSchema),
});
export type OrganizerPayouts = z.infer<typeof organizerPayoutsSchema>;

export const getPayoutsInputSchema = viewAsInputSchema;
export type GetPayoutsInput = z.infer<typeof getPayoutsInputSchema>;

export const requestPayoutInputSchema = z.object({
  amountCents: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
});
export type RequestPayoutInput = z.infer<typeof requestPayoutInputSchema>;

export const cancelPayoutRequestInputSchema = z.object({
  id: z.string().min(1),
});
export type CancelPayoutRequestInput = z.infer<
  typeof cancelPayoutRequestInputSchema
>;

export const platformPayoutRequestSchema = organizerPayoutRequestSchema.extend({
  organizationId: z.string(),
  organizationName: z.string(),
  organizationSlug: z.string(),
  ownerEmail: z.string().nullable(),
  stripeAccountId: z.string().nullable(),
  stripeAccountKind: stripeAccountKindSchema.nullable(),
  connectState: connectStateSchema,
});
export type PlatformPayoutRequest = z.infer<typeof platformPayoutRequestSchema>;

export const resolvePayoutRequestInputSchema = z.object({
  id: z.string().min(1),
  outcome: z.enum(['PAID', 'REJECTED']),
  rail: payoutRailSchema.optional(),
  reference: z.string().trim().max(200).optional(),
  adminNote: z.string().trim().max(500).optional(),
});
export type ResolvePayoutRequestInput = z.infer<
  typeof resolvePayoutRequestInputSchema
>;

export const sendPayoutViaStripeInputSchema = z.object({
  id: z.string().min(1),
});
export type SendPayoutViaStripeInput = z.infer<
  typeof sendPayoutViaStripeInputSchema
>;

/**
 * A row and Stripe's money movement disagree (Connect plan decision 17,
 * Global Payouts plan decision 9). Computed from Stripe at read time, never
 * stored. `stripeIds` are transfers (`tr_…`) or outbound payments (`obp_…`).
 */
export const payoutMismatchSchema = z.object({
  requestId: z.string(),
  kind: z.enum([
    'paid_without_transfer',
    'requested_with_transfer',
    'duplicate_transfer',
    'closed_with_transfer',
    'transfer_without_request',
    'payment_returned',
  ]),
  stripeIds: z.array(z.string()),
});
export type PayoutMismatch = z.infer<typeof payoutMismatchSchema>;

export const platformPayoutBalanceSchema = z.object({
  availableCents: z.number().int(),
  openRequestsCents: z.number().int(),
});
export type PlatformPayoutBalance = z.infer<typeof platformPayoutBalanceSchema>;

export const setPayoutSetupStepInputSchema = z.object({
  organizationId: z.string().min(1),
  step: z.enum(['meeting', 'bank']),
  done: z.boolean(),
});
export type SetPayoutSetupStepInput = z.infer<
  typeof setPayoutSetupStepInputSchema
>;

/** Null resets an override to the platform default. */
export const setPayoutPolicyInputSchema = z.object({
  organizationId: z.string().min(1),
  releaseAtSale: z.boolean(),
  holdbackPercent: z.number().int().min(0).max(100).nullable(),
  holdbackDays: z.number().int().min(0).max(365).nullable(),
});
export type SetPayoutPolicyInput = z.infer<typeof setPayoutPolicyInputSchema>;

export const payoutOrganizationSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  slug: z.string(),
  ownerEmail: z.string().nullable(),
  payoutMeetingAt: z.string().datetime().nullable(),
  payoutBankLinkedAt: z.string().datetime().nullable(),
  payoutTermsAcceptedAt: z.string().datetime().nullable(),
  payoutTermsVersion: z.string().nullable(),
  stripeAccountId: z.string().nullable(),
  stripeAccountKind: stripeAccountKindSchema.nullable(),
  stripeTransfersStatus: z.string().nullable(),
  setup: payoutSetupStateSchema,
  policy: payoutPolicySchema,
  /** The raw overrides — null means the org follows the platform default. */
  holdbackPercentOverride: z.number().int().nullable(),
  holdbackDaysOverride: z.number().int().nullable(),
  hasCustomPolicy: z.boolean(),
});
export type PayoutOrganization = z.infer<typeof payoutOrganizationSchema>;
