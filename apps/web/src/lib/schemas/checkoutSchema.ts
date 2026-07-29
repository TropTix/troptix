import { z } from 'zod';

export const userDetailsSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z
      .string()
      .email('Invalid email address')
      .min(1, 'Email is required'),
    confirmEmail: z.string().email().min(1, 'Confirmation email is required'),
  })
  .refine((data) => data.email === data.confirmEmail, {
    message: 'Email addresses do not match',
    path: ['confirmEmail'],
  });

export type UserDetailsFormData = z.infer<typeof userDetailsSchema>;
