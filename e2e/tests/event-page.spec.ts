import { test, expect } from '../lib/test';
import { GA, VIP, EDGE } from '../lib/events';
import {
  openCheckout,
  ticketTypeCard,
  addTickets,
  checkoutStep,
} from '../lib/checkout';

test('event page loads and shows its tickets with prices and fees', async ({
  page,
  factory,
  chapter,
}) => {
  const event = await factory.createPaidEvent();

  await chapter('Event page loads', async () => {
    await page.goto(`/e/${event.id}`);
    await expect(page.getByRole('heading', { name: event.name })).toBeVisible();
  });

  await chapter('Tickets load with prices and fees', async () => {
    await page.getByRole('button', { name: /Get Tickets/ }).click();
    await expect(checkoutStep(page, 'Choose tickets')).toBeVisible();

    const ga = ticketTypeCard(page, event.ticketTypes.ga.id);
    await expect(ga).toContainText(GA.name);
    await expect(ga).toContainText('$25.00');
    await expect(ga).toContainText('+ $2.50 fees');

    const vip = ticketTypeCard(page, event.ticketTypes.vip.id);
    await expect(vip).toContainText(VIP.name);
    await expect(vip).toContainText('$75.00');
    await expect(vip).toContainText('+ $6.50 fees');
  });
});

test('ticket states: almost gone, sold out, on sale soon, gated hidden', async ({
  page,
  factory,
  chapter,
}) => {
  const event = await factory.createEdgeEvent();

  await chapter('Each ticket state renders correctly', async () => {
    await openCheckout(page, event.id, /Get Tickets/);
    await expect(page.getByText(EDGE.nearCapacity)).toBeVisible();
    await expect(page.getByText('Sold out', { exact: true })).toBeVisible();
    await expect(page.getByText('On sale soon', { exact: true })).toBeVisible();
    await expect(page.getByText(EDGE.gated)).toHaveCount(0);
  });
});

test('selection clamps at the per-user max and totals update', async ({
  page,
  factory,
  chapter,
}) => {
  const event = await factory.createPaidEvent();
  await openCheckout(page, event.id, /Get Tickets/);

  await chapter('VIP stops at 4 per person', async () => {
    const vip = ticketTypeCard(page, event.ticketTypes.vip.id);
    const addVip = vip.getByRole('button', { name: 'Add one' });
    for (let i = 0; i < VIP.maxPerUser; i++) await addVip.click();
    await expect(vip.getByText(String(VIP.maxPerUser))).toBeVisible();
    await expect(addVip).toBeDisabled();
    const removeVip = vip.getByRole('button', { name: 'Remove one' });
    for (let i = 0; i < VIP.maxPerUser; i++) await removeVip.click();
  });

  await chapter('Total includes fees: 2 × ($25 + $2.50) = $55', async () => {
    await addTickets(page, event.ticketTypes.ga.id, 2);
    await expect(page.getByText('$55.00')).toBeVisible();
    await expect(page.getByText('2 tickets · incl. $5.00 fees')).toBeVisible();
  });
});
