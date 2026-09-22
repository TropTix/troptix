import { expect, type Page } from '@playwright/test';

export async function openCheckout(page: Page, eventId: string, cta: RegExp) {
  await page.goto(`/e/${eventId}`);
  await page.getByRole('button', { name: cta }).click();
  await expect(checkoutStep(page, 'Choose tickets')).toBeVisible();
}

// The sheet's sr-only title names the dialog after the current step.
export function checkoutStep(page: Page, title: string) {
  return page.getByRole('dialog', { name: title });
}

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

export const CARDS = {
  success: '4242 4242 4242 4242',
  declined: '4000 0000 0000 0002',
  insufficientFunds: '4000 0000 0000 9995',
};

// The Payment Element lives in a cross-origin Stripe iframe whose inputs
// appear a moment after the frame itself, so wait on the field, not the frame.
export async function fillCard(page: Page, number: string) {
  const frame = page.frameLocator('iframe[title="Secure payment input frame"]');
  const cardNumber = frame.getByRole('textbox', { name: /card number/i });
  await expect(cardNumber).toBeVisible({ timeout: 45_000 });
  await cardNumber.fill(number);
  await frame.getByRole('textbox', { name: /expir/i }).fill('12 / 34');
  await frame.getByRole('textbox', { name: /security code|cvc/i }).fill('123');
  // Postal code is optional in the Element and can paint a beat after the
  // card fields, so wait briefly rather than checking once.
  const zip = frame.getByRole('textbox', { name: /zip|postal/i });
  const hasZip = await zip.waitFor({ state: 'visible', timeout: 3_000 }).then(
    () => true,
    () => false
  );
  if (hasZip) await zip.fill('12345');
}

export function reservationIdFromUrl(page: Page): string {
  const id = new URL(page.url()).searchParams.get('reservation');
  if (!id) throw new Error(`No reservation id in URL: ${page.url()}`);
  return id;
}

export async function successOrderId(page: Page): Promise<string> {
  const href = await page
    .getByRole('link', { name: /View tickets/ })
    .getAttribute('href');
  const match = href?.match(/^\/orders\/([^/]+)\/tickets$/);
  if (!match) throw new Error(`Unexpected View-tickets href: ${href}`);
  return match[1];
}
