import type { EmailOrder } from '../emails/EmailConfirmation';

/**
 * Calendar helpers for the order-confirmation email: an `.ics` attachment that
 * mail clients (Apple Mail, Outlook, Gmail) auto-detect, plus "Add to Calendar"
 * web links for clients that don't.
 *
 * Times are emitted as UTC instants (`...Z`). That fixes the exact moment of the
 * event unambiguously; each calendar then renders it in the viewer's own zone.
 */

/** When no end time is recorded, assume an event runs this long. */
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

function eventEnd(event: EmailOrder['event']): Date {
  if (event.endDate) return new Date(event.endDate);
  return new Date(new Date(event.startDate).getTime() + DEFAULT_DURATION_MS);
}

/** `YYYYMMDDTHHMMSSZ` — the UTC "form 2" date-time of RFC 5545. */
function toIcsUtc(date: Date): string {
  return new Date(date)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Escape a value for an ICS TEXT field (RFC 5545 §3.3.11). */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold a content line to the 75-octet limit (RFC 5545 §3.1). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 74) {
    chunks.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(' ' + rest);
  return chunks.join('\r\n');
}

function calendarDescription(order: EmailOrder, ticketUrl: string): string {
  const lines = [order.event.description, `View your tickets: ${ticketUrl}`]
    .filter((line): line is string => Boolean(line && line.trim()))
    .join('\n\n');
  return lines;
}

export interface CalendarLinks {
  google: string;
  outlook: string;
}

/** Pre-filled "Add to Calendar" web links for Google and Outlook. */
export function buildCalendarLinks(
  order: EmailOrder,
  ticketUrl: string
): CalendarLinks {
  const { event } = order;
  const start = new Date(event.startDate);
  const end = eventEnd(event);
  const details = calendarDescription(order, ticketUrl);

  const google = new URL('https://calendar.google.com/calendar/render');
  google.searchParams.set('action', 'TEMPLATE');
  google.searchParams.set('text', event.name);
  google.searchParams.set('dates', `${toIcsUtc(start)}/${toIcsUtc(end)}`);
  if (event.address) google.searchParams.set('location', event.address);
  if (details) google.searchParams.set('details', details);

  const outlook = new URL(
    'https://outlook.office.com/calendar/0/deeplink/compose'
  );
  outlook.searchParams.set('path', '/calendar/action/compose');
  outlook.searchParams.set('rru', 'addevent');
  outlook.searchParams.set('subject', event.name);
  outlook.searchParams.set('startdt', start.toISOString());
  outlook.searchParams.set('enddt', end.toISOString());
  if (event.address) outlook.searchParams.set('location', event.address);
  if (details) outlook.searchParams.set('body', details);

  return { google: google.toString(), outlook: outlook.toString() };
}

/** Filename for the `.ics` attachment. */
export function calendarFileName(order: EmailOrder): string {
  const slug = order.event.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'event'}.ics`;
}

/**
 * A single-event `VCALENDAR` document for the order's event. The UID is keyed to
 * the order so re-sends update the same calendar entry rather than duplicating.
 */
export function buildEventIcs(order: EmailOrder, ticketUrl: string): string {
  const { event } = order;
  const stamp = order.createdAt
    ? new Date(order.createdAt)
    : new Date(event.startDate);
  const description = calendarDescription(order, ticketUrl);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TropTix//Order Confirmation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${order.id}@usetroptix.com`,
    `DTSTAMP:${toIcsUtc(stamp)}`,
    `DTSTART:${toIcsUtc(event.startDate)}`,
    `DTEND:${toIcsUtc(eventEnd(event))}`,
    `SUMMARY:${escapeIcsText(event.name)}`,
    event.address ? `LOCATION:${escapeIcsText(event.address)}` : null,
    description ? `DESCRIPTION:${escapeIcsText(description)}` : null,
    `URL:${ticketUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((line): line is string => line !== null);

  return lines.map(foldLine).join('\r\n');
}
