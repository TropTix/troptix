import { z } from 'zod';

// Request bodies for the organizer REST routes consumed by the Expo organizer
// app. Keep the field names and error messages stable — the mobile client may
// display them.
export const scanTicketSchema = z.object({
  ticketId: z.string().min(1),
  eventId: z.string().min(1),
});

export const checkInTicketSchema = z.object({
  ticketId: z.string().min(1),
});
