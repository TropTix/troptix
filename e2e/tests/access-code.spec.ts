import { test, expect } from '../lib/test';
import { BUYER, EDGE } from '../lib/events';
import {
  CARDS,
  openCheckout,
  ticketTypeCard,
  addTickets,
  fillContact,
  fillCard,
  successOrderId,
} from '../lib/checkout';
import { getInventory, getOrder, getTickets } from '../lib/db';

// Members Only is $60.00 + $5.30 fees. The code is stored uppercased and the
// buyer types it in lower case, so this also covers the normalization.
const GATED_PRICE_CENTS = 6000;
const GATED_FEES_CENTS = 530;

test('an access code reveals the gated ticket type, and it can be bought', async ({
  page,
  factory,
}) => {
  const event = await factory.createEdgeEvent();
  const gated = event.ticketTypes.gated;
  const card = ticketTypeCard(page, gated.id);

  await test.step('The gated ticket type is hidden and a wrong code is refused', async () => {
    await openCheckout(page, event.id, /Get Tickets/);
    await expect(card).toHaveCount(0);
    await page.getByLabel('Access code').fill('WRONG');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('alert')).toContainText(/didn't work/);
    await expect(card).toHaveCount(0);
  });

  await test.step('The right code, in any case, unlocks the ticket type', async () => {
    await page.getByLabel('Access code').fill(EDGE.gateCode.toLowerCase());
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(card).toContainText(EDGE.gated);
    await expect(card).toContainText('Unlocked');
    await expect(page.getByTestId('access-code-chip')).toContainText(
      EDGE.gateCode
    );
  });

  await test.step('Removing the code hides the ticket type and clears its quantity', async () => {
    await addTickets(page, gated.id, 1);
    await expect(page.getByText('$65.30')).toBeVisible();
    await page.getByRole('button', { name: 'Remove access code' }).click();
    await expect(card).toHaveCount(0);
    await expect(page.getByText('$0.00')).toBeVisible();
  });

  await test.step('Re-apply and buy one', async () => {
    await page.getByLabel('Access code').fill(EDGE.gateCode);
    await page.getByRole('button', { name: 'Apply' }).click();
    await addTickets(page, gated.id, 1);
    await page.getByRole('button', { name: 'Continue' }).click();
    await fillContact(page, BUYER);
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await fillCard(page, CARDS.success);
    await page.getByRole('button', { name: /^Pay \$65\.30/ }).click();
    await expect(page.getByText(/Order confirmed · 1 ticket/)).toBeVisible({
      timeout: 30_000,
    });
  });

  const orderId = await successOrderId(page);

  await test.step('The gated ticket type was sold', async () => {
    const order = await getOrder(orderId);
    expect(order?.status).toBe('COMPLETED');
    expect(order?.totalCents).toBe(GATED_PRICE_CENTS + GATED_FEES_CENTS);
    expect(await getTickets(orderId)).toHaveLength(1);
    const inventory = await getInventory(gated.id);
    expect(inventory.sold).toBe(1);
    expect(inventory.reserved).toBe(0);
  });
});
