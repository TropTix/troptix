import { expect, type Page } from '@playwright/test';
import { goto } from './nav';

/** Land on the event page and open the checkout sheet. */
export async function openCheckout(page: Page, eventId: string, cta: RegExp) {
  await goto(page, `/e/${eventId}`);
  await page.getByRole('button', { name: cta }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose tickets' })
  ).toBeVisible();
}

/** A Ticket type card in the select step, located by its data-testid. */
export function ticketTypeCard(page: Page, ticketTypeId: string) {
  return page.getByTestId(`ticket-type-${ticketTypeId}`);
}

export async function addTickets(
  page: Page,
  ticketTypeId: string,
  count: number
) {
  const add = ticketTypeCard(page, ticketTypeId).getByRole('button', {
    name: 'Add one',
  });
  for (let i = 0; i < count; i++) await add.click();
}

export async function fillContact(
  page: Page,
  contact: { firstName: string; lastName: string; email: string }
) {
  await page.getByLabel('First name').fill(contact.firstName);
  await page.getByLabel('Last name').fill(contact.lastName);
  await page.getByLabel('Email').fill(contact.email);
}

/**
 * Fill Stripe's embedded Payment Element with a test card. The element lives
 * in a cross-origin iframe; its inputs appear 1–3s after the iframe itself, so
 * wait on the field, not the frame.
 */
export async function fillPaymentElement(page: Page) {
  const frame = page.frameLocator('iframe[title="Secure payment input frame"]');
  const cardNumber = frame.getByRole('textbox', { name: /card number/i });
  await expect(cardNumber).toBeVisible({ timeout: 45_000 });
  await cardNumber.fill('4242 4242 4242 4242');
  await frame.getByRole('textbox', { name: /expir/i }).fill('12 / 34');
  await frame.getByRole('textbox', { name: /security code|cvc/i }).fill('123');
  const zip = frame.getByRole('textbox', { name: /zip|postal/i });
  if (await zip.isVisible().catch(() => false)) await zip.fill('12345');
}

/** On the success screen, pull the orderId out of the View-tickets link. */
export async function successOrderId(page: Page): Promise<string> {
  const href = await page
    .getByRole('link', { name: /View tickets/ })
    .getAttribute('href');
  const match = href?.match(/^\/orders\/([^/]+)\/tickets$/);
  if (!match) throw new Error(`Unexpected View-tickets href: ${href}`);
  return match[1];
}
