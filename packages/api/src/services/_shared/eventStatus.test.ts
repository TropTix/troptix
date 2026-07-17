import { describe, expect, it } from 'vitest';
import { getEventStatus } from './eventStatus';

const now = new Date('2026-07-15T12:00:00Z');

const event = (startsAt: string, endsAt: string, isDraft = false) => ({
  isDraft,
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
});

describe('getEventStatus', () => {
  it('is Draft regardless of dates when unpublished', () => {
    expect(getEventStatus(event('2026-07-01', '2026-07-02', true), now)).toBe(
      'Draft'
    );
    expect(getEventStatus(event('2026-12-01', '2026-12-02', true), now)).toBe(
      'Draft'
    );
  });

  it('is Upcoming before the start', () => {
    expect(getEventStatus(event('2026-08-01', '2026-08-02'), now)).toBe(
      'Upcoming'
    );
  });

  it('is Active between start and end', () => {
    expect(getEventStatus(event('2026-07-14', '2026-07-16'), now)).toBe(
      'Active'
    );
  });

  it('is Past after the end', () => {
    expect(getEventStatus(event('2026-06-01', '2026-06-02'), now)).toBe('Past');
  });

  it('treats the exact start and end instants as Active (inclusive bounds)', () => {
    expect(
      getEventStatus(event('2026-07-15T12:00:00Z', '2026-07-16'), now)
    ).toBe('Active');
    expect(
      getEventStatus(event('2026-07-14', '2026-07-15T12:00:00Z'), now)
    ).toBe('Active');
  });
});
