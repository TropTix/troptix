import { z } from 'zod';

// Field names and error messages here reach the separately shipped Expo
// organizer app — keep them stable.
export const scanTicketSchema = z.object({
  ticketId: z.string().min(1),
  eventId: z.string().min(1),
});

export const checkInTicketSchema = z.object({
  ticketId: z.string().min(1),
});
