import { z } from 'zod';
import { eventTicketSchema } from './events';

export const applyCodeInputSchema = z.object({
  eventId: z.string().min(1),
  code: z.string().trim().min(1).max(100),
});
export type ApplyCodeInput = z.infer<typeof applyCodeInputSchema>;

/**
 * Why a code opens nothing, shared by apply-code and the hold (ADR 0037).
 * Exhausted and revoked both read `unavailable`: the guest's next step is the
 * same either way.
 */
export const codeRefusalSchemas = [
  z.object({ type: z.literal('invalid') }),
  z.object({ type: z.literal('inUse') }),
  z.object({ type: z.literal('unavailable') }),
  z.object({ type: z.literal('expired'), expiresAt: z.string().datetime() }),
] as const;
const codeRefusalSchema = z.discriminatedUnion('type', [...codeRefusalSchemas]);
export type CodeRefusal = z.infer<typeof codeRefusalSchema>;

export const applyCodeResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('unlocked'),
    tickets: z.array(eventTicketSchema).min(1),
    /** Most tickets one checkout may take across `tickets`; null leaves each type's own cap. */
    quantity: z.number().int().nullable(),
    /** Who the grant was issued to, for the contact step to prefill. */
    holderEmail: z.string().nullable(),
    /** For analytics: a holder makes an invitation; any limit makes it limited. */
    kind: z.enum(['unlimited', 'limited', 'invitation']),
  }),
  ...codeRefusalSchemas,
]);
export type ApplyCodeResponse = z.infer<typeof applyCodeResponseSchema>;
