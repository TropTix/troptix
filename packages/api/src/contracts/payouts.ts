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

export const payoutSetupStateSchema = z.object({
  meetingDone: z.boolean(),
  bankLinked: z.boolean(),
  complete: z.boolean(),
});
export type PayoutSetupState = z.infer<typeof payoutSetupStateSchema>;

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
  setup: payoutSetupStateSchema,
  policy: payoutPolicySchema,
  hasCustomPolicy: z.boolean(),
});
export type PayoutOrganization = z.infer<typeof payoutOrganizationSchema>;
