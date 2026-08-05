import { test, expect, GA, VIP, EDGE } from '../lib/testEvent';
import { goto } from '../lib/nav';
import { openCheckout, ticketTypeCard, addTickets } from '../lib/checkout';

test('paid event page loads and shows its tickets', async ({
  page,
  factory,
}) => {
  const event = await factory.createPaidEvent();

  await goto(page, `/e/${event.id}`);
  await expect(page.getByRole('heading', { name: event.name })).toBeVisible();

  await page.getByRole('button', { name: /Get Tickets/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose tickets' })
  ).toBeVisible();

  const ga = ticketTypeCard(page, event.ticketTypes.ga.id);
  await expect(ga).toContainText(GA.name);
  await expect(ga).toContainText('$25.00');
  await expect(ga).toContainText('+ $2.50 fees');

  const vip = ticketTypeCard(page, event.ticketTypes.vip.id);
  await expect(vip).toContainText(VIP.name);
  await expect(vip).toContainText('$75.00');
  await expect(vip).toContainText('+ $6.50 fees');
});

test('ticket type edge states render correctly', async ({ page, factory }) => {
  const event = await factory.createEdgeEvent();
  await openCheckout(page, event.id, /Get Tickets/);

  await expect(page.getByText(EDGE.nearCapacity)).toBeVisible();
  await expect(page.getByText('Sold out', { exact: true })).toBeVisible();
  await expect(page.getByText('On sale soon', { exact: true })).toBeVisible();
  // Gated ticket type stays hidden until its code is entered.
  await expect(page.getByText(EDGE.gated)).toHaveCount(0);
});

test('selection clamps at the per-user max and totals update', async ({
  page,
  factory,
}) => {
  const event = await factory.createPaidEvent();
  await openCheckout(page, event.id, /Get Tickets/);

  // VIP allows 4 per user; the fifth add must not land.
  const vip = ticketTypeCard(page, event.ticketTypes.vip.id);
  const addVip = vip.getByRole('button', { name: 'Add one' });
  for (let i = 0; i < VIP.maxPerUser; i++) await addVip.click();
  await expect(vip.getByText(String(VIP.maxPerUser))).toBeVisible();
  await expect(addVip).toBeDisabled();

  // Clear VIP again, then check the running total for 2 × GA:
  // 2 × ($25.00 + $2.50 fees) = $55.00.
  const removeVip = vip.getByRole('button', { name: 'Remove one' });
  for (let i = 0; i < VIP.maxPerUser; i++) await removeVip.click();
  await addTickets(page, event.ticketTypes.ga.id, 2);
  await expect(page.getByText('$55.00')).toBeVisible();
  await expect(page.getByText('2 tickets · incl. $5.00 fees')).toBeVisible();
});
