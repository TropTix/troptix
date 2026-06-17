import { createElement } from 'react';
import { render } from 'react-email';
import EmailConfirmationTemplate, {
  type EmailOrder,
} from '../emails/EmailConfirmation';

/** A ready-to-send transactional email: subject line + rendered HTML body. */
export interface EmailContent {
  subject: string;
  html: string;
}

export interface BuildOrderConfirmationOptions {
  /** Absolute origin for in-email links, e.g. `https://usetroptix.com`. */
  baseUrl: string;
}

/**
 * Build the order-confirmation email — subject and HTML together — for an order.
 *
 * Transport-agnostic: the caller owns data fetching and the mail client.
 * `event.imageUrl` must already be an absolute URL — email clients can't
 * resolve a relative/bucket-path src.
 */
export async function buildOrderConfirmation(
  order: EmailOrder,
  { baseUrl }: BuildOrderConfirmationOptions
): Promise<EmailContent> {
  const html = await render(
    createElement(EmailConfirmationTemplate, { order, baseUrl })
  );
  return {
    subject: `Order Confirmation for ${order.event.name}`,
    html,
  };
}
