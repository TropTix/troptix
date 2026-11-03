import { describe, expect, it } from 'vitest';
import { buildGuestInvitation } from './guestInvitation';

const invite = {
  eventId: 'evt-gala',
  eventName: 'Hearts of Legend Gala',
  organizationName: 'Hearts Foundation',
  startsAt: new Date('2027-01-17T00:00:00Z'),
  code: 'K7QM4TPZ',
  quantity: 2,
  expiresAt: new Date('2027-01-06T04:59:00Z'),
};

describe('buildGuestInvitation', () => {
  it('names the event and organization in the subject', async () => {
    const email = await buildGuestInvitation(invite, {
      baseUrl: 'https://usetroptix.com',
    });
    expect(email.subject).toBe(
      "You're invited to Hearts of Legend Gala by Hearts Foundation"
    );
  });

  it('links to the event with the code and shows the code as text', async () => {
    const email = await buildGuestInvitation(invite, {
      baseUrl: 'https://usetroptix.com',
    });
    expect(email.link).toBe('https://usetroptix.com/e/evt-gala?code=K7QM4TPZ');
    expect(email.html).toContain(
      'href="https://usetroptix.com/e/evt-gala?code=K7QM4TPZ"'
    );
    expect(email.text).toContain('K7QM4TPZ');
  });

  it('states the time, cap and expiry with the zone labelled', async () => {
    const { text } = await buildGuestInvitation(invite, {
      baseUrl: 'https://usetroptix.com',
    });
    expect(text).toContain('Sat, Jan 16, 2027, 7:00 PM EST');
    expect(text).toContain('You can get up to 2 tickets.');
    expect(text).toContain('expires Tue, Jan 5, 2027, 11:59 PM EST');
  });

  it('leaves out the cap and expiry when the grant has none', async () => {
    const { text } = await buildGuestInvitation(
      { ...invite, quantity: null, expiresAt: null },
      { baseUrl: 'https://usetroptix.com' }
    );
    expect(text).not.toContain('You can get up to');
    expect(text).not.toContain('expires');
  });
});
