import { z } from 'zod';
import { ticketTypeSchema } from './ticketSchema';

export const eventFormSchema = z
  .object({
    eventName: z.string().min(3, {
      message: 'Event name must be at least 3 characters.',
    }),
    description: z.string().min(1, { message: 'Description is required.' }),
    startDate: z.date({
      required_error: 'Start date is required.',
      invalid_type_error: 'Start date must be a valid date.', // Added invalid type error
    }),
    organizer: z.string().min(1, { message: 'Name of organizer is required.' }),
    endDate: z.date({
      required_error: 'End date is required.',
      invalid_type_error: 'End date must be a valid date.', // Added invalid type error
    }),
    venue: z.string().min(1, { message: 'Venue is required.' }),
    address: z.string().min(5, {
      message: 'Street address details are required (min 5 chars).',
    }),
    country: z.string().optional(),
    countryCode: z.string().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    tickets: z.array(ticketTypeSchema).optional(),
    // Holds a Supabase Storage object PATH, not a URL (ADR 0016), so this is a
    // plain string — not `.url()`, which would reject the path. Empty string
    // means "no image". Render via eventFlyerUrl().
    imageUrl: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.endDate > data.startDate) {
        return true;
      }
      if (data.startDate > data.endDate) {
        return false;
      }
      return true;
    },
    {
      message: 'Event must end after it starts.',
      path: ['endDate'], // Keep error attached to endDate
    }
  );

export type EventFormValues = z.infer<typeof eventFormSchema>;
