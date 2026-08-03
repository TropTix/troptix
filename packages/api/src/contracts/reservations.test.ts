import { describe, expect, it } from 'vitest';
import { reservationContactSchema } from './reservations';

describe('reservationContactSchema', () => {
  it('lowercases a mixed-case email', () => {
    const result = reservationContactSchema.parse({
      firstName: 'Bob',
      lastName: 'Smith',
      email: 'Bob@Gmail.com',
    });
    expect(result.email).toBe('bob@gmail.com');
  });

  it('trims whitespace before lowercasing', () => {
    const result = reservationContactSchema.parse({
      firstName: 'Bob',
      lastName: 'Smith',
      email: '  Bob@Gmail.com  ',
    });
    expect(result.email).toBe('bob@gmail.com');
  });

  it('leaves an already-lowercase email unchanged', () => {
    const result = reservationContactSchema.parse({
      firstName: 'Bob',
      lastName: 'Smith',
      email: 'already@lower.com',
    });
    expect(result.email).toBe('already@lower.com');
  });

  it('rejects an invalid email without swallowing the error', () => {
    const result = reservationContactSchema.safeParse({
      firstName: 'Bob',
      lastName: 'Smith',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Enter a valid email.');
    }
  });
});
