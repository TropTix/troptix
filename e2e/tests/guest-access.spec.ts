import { test, expect } from '../lib/test';
import { BUYER } from '../lib/events';
import {
  CARDS,
  checkoutStep,
  ticketTypeCard,
  addTickets,
  fillCard,
  successOrderId,
} from '../lib/checkout';
import { query } from '../lib/db';

// Members Only on the edge event: $60.00 + $5.30 fees, 4 per order on its own.

async function grantRow(eventId: string, code: string) {
  const { rows } = await query(
    `select g.id, g."usedCount", r.id as "reservationId"
       from public."Grant" g
       left join public."Reservation" r on r."grantId" = g.id
      where g."eventId" = $1 and g.code = $2`,
    [eventId, code]
  );
  return rows[0] as { id: string; usedCount: number; reservationId: string };
}

test('a one-use invitation unlocks, caps, prefills, sells once, then reads used', async ({
  page,
  factory,
}) => {
  const event = await factory.createEdgeEvent();
  const gated = event.ticketTypes.gated;
  const code = await factory.addGrant(event.id, [gated.id], {
    code: 'GALA2GUEST',
    maxUses: 1,
    quantity: 2,
    holderEmail: 'invited.guest@example.com',
  });
  const add = ticketTypeCard(page, gated.id).getByRole('button', {
    name: 'Add one',
  });

  await test.step('The link unlocks the type and caps the order at the grant’s two', async () => {
    await page.goto(`/e/${event.id}?code=${code.toLowerCase()}`);
    await expect(checkoutStep(page, 'Choose tickets')).toBeVisible();
    await expect(page.getByTestId('access-code-chip')).toContainText(code);
    await expect(page.getByText('up to 2 tickets in this order')).toBeVisible();
    await addTickets(page, gated.id, 2);
    await expect(add).toBeDisabled();
  });

  await test.step('The contact step starts from the invited address', async () => {
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByLabel('Email')).toHaveValue(
      'invited.guest@example.com'
    );
    await page.getByLabel('First name').fill(BUYER.firstName);
    await page.getByLabel('Last name').fill(BUYER.lastName);
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await fillCard(page, CARDS.success);
    await page.getByRole('button', { name: /^Pay \$130\.60/ }).click();
    await expect(page.getByText(/Order confirmed · 2 tickets/)).toBeVisible({
      timeout: 30_000,
    });
  });

  const orderId = await successOrderId(page);

  await test.step('The order records the grant and the use stays spent', async () => {
    const grant = await grantRow(event.id, code);
    expect(grant.usedCount).toBe(1);
    const { rows } = await query(
      `select "orderId" from public."Reservation" where id = $1`,
      [grant.reservationId]
    );
    expect(rows[0].orderId).toBe(orderId);
  });

  await test.step('The same code now reads as used', async () => {
    await page.goto(`/e/${event.id}?code=${code}`);
    await expect(checkoutStep(page, 'Choose tickets')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(
      'This code has already been used or is no longer valid.'
    );
    await expect(ticketTypeCard(page, gated.id)).toHaveCount(0);
  });
});

test('an expired code says when it expired', async ({ page, factory }) => {
  const event = await factory.createEdgeEvent();
  const code = await factory.addGrant(event.id, [event.ticketTypes.gated.id], {
    code: 'LATEARRIVAL',
    expiresAt: new Date(Date.now() - 60_000),
  });

  await page.goto(`/e/${event.id}?code=${code}`);
  await expect(checkoutStep(page, 'Choose tickets')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/This code expired on /);
  await expect(ticketTypeCard(page, event.ticketTypes.gated.id)).toHaveCount(0);
});

test('a one-use code held by one guest is in use for another, at apply and at hold', async ({
  page,
  browser,
  factory,
}) => {
  const event = await factory.createEdgeEvent();
  const gated = event.ticketTypes.gated;
  const code = await factory.addGrant(event.id, [gated.id], {
    code: 'ONEFORTWO',
    maxUses: 1,
  });
  const other = await browser.newContext();
  const second = await other.newPage();

  async function unlockAndSelect(p: typeof page) {
    await p.goto(`/e/${event.id}?code=${code}`);
    await expect(p.getByTestId('access-code-chip')).toContainText(code);
    await addTickets(p, gated.id, 1);
    await p.getByRole('button', { name: 'Continue' }).click();
    await p.getByLabel('First name').fill(BUYER.firstName);
    await p.getByLabel('Last name').fill(BUYER.lastName);
    await p.getByLabel('Email').fill(BUYER.email);
  }

  await test.step('Both guests unlock before either holds', async () => {
    await unlockAndSelect(page);
    await unlockAndSelect(second);
  });

  await test.step('The first hold takes the use', async () => {
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(checkoutStep(page, 'Payment')).toBeVisible();
  });

  await test.step('The second hold is refused and sends the guest back to the code', async () => {
    await second.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(checkoutStep(second, 'Choose tickets')).toBeVisible();
    await expect(second.getByRole('alert')).toContainText(
      'Someone is checking out with this code.'
    );
    await expect(second.getByLabel('Access code')).toHaveValue(code);
    await expect(ticketTypeCard(second, gated.id)).toHaveCount(0);
  });

  await test.step('Applying it fresh also reads in use', async () => {
    await second.getByRole('button', { name: 'Apply' }).click();
    await expect(second.getByRole('alert')).toContainText(
      'Someone is checking out with this code.'
    );
  });

  const grant = await grantRow(event.id, code);
  expect(grant.usedCount).toBe(1);
  await other.close();
});
