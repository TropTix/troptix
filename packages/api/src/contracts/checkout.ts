import { z } from 'zod';
import { eventTicketSchema } from './events';

export const applyCodeInputSchema = z.object({
  eventId: z.string().min(1),
  code: z.string().trim().min(1).max(100),
});
export type ApplyCodeInput = z.infer<typeof applyCodeInputSchema>;

export const applyCodeResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('unlocked'),
    tickets: z.array(eventTicketSchema).min(1),
  }),
  z.object({ type: z.literal('invalid') }),
]);
export type ApplyCodeResponse = z.infer<typeof applyCodeResponseSchema>;
