import { createElement } from 'react';
import { render } from 'react-email';
import EmailConfirmationTemplate, {
  type EmailOrder,
} from '../emails/EmailConfirmation';
import { buildEventIcs, calendarFileName } from './calendar';

/** A file to attach to an outgoing email. `content` is the raw (utf-8) body. */
export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

/** A ready-to-send transactional email: subject, HTML body, and attachments. */
export interface EmailContent {
  subject: string;
  html: string;
  attachments: EmailAttachment[];
}

export interface BuildOrderConfirmationOptions {
  /** Absolute origin for in-email links, e.g. `https://usetroptix.com`. */
  baseUrl: string;
}

/**
 * Build the order-confirmation email — subject, HTML, and a calendar (`.ics`)
 * attachment — for an order.
 *
 * Transport-agnostic: the caller owns data fetching and the mail client.
 * `event.imageUrl` must already be an absolute URL — email clients can't
 * resolve a relative/bucket-path src.
 */
export async function buildOrderConfirmation(
  order: EmailOrder,
  { baseUrl }: BuildOrderConfirmationOptions
): Promise<EmailContent> {
  const ticketUrl = `${baseUrl}/orders/${order.id}/tickets`;
  const html = await render(
    createElement(EmailConfirmationTemplate, { order, baseUrl })
  );
  return {
    subject: `Order Confirmation for ${order.event.name}`,
    html,
    attachments: [
      {
        filename: calendarFileName(order),
        content: buildEventIcs(order, ticketUrl),
        contentType: 'text/calendar; method=PUBLISH; charset=utf-8',
      },
    ],
  };
}
