import { test, expect, GA, CONTACT } from '../lib/testEvent';
import {
  openCheckout,
  addTickets,
  fillContact,
  fillPaymentElement,
  successOrderId,
} from '../lib/checkout';
import {
  getInventory,
  getOrder,
  getTickets,
  getReservationForOrder,
} from '../lib/db';
import { getPaymentIntent, stripeKeyAvailable } from '../lib/stripe';

// The one paid-card journey: 2 × GA at $25.00 + $2.50 fees = $55.00. Stripe's
// confirm() ends in a full-page redirect back to /e/[id]?reservation=…, where
// the page remounts and polls until the order exists — the assertions after
// the redirect cover that whole resume path.
test('paid checkout charges the card and records the order', async ({
  page,
  factory,
}) => {
  const QTY = 2;
  const TOTAL_CENTS = QTY * (GA.priceCents + GA.feesCents);
  const event = await factory.createPaidEvent();
  const ga = event.ticketTypes.ga;

  await openCheckout(page, event.id, /Get Tickets/);
  await addTickets(page, ga.id, QTY);
  await page.getByRole('button', { name: 'Continue' }).click();

  await fillContact(page, CONTACT);
  await page.getByRole('button', { name: 'Continue to payment' }).click();

  await fillPaymentElement(page);
  await page.getByRole('button', { name: /^Pay \$55\.00/ }).click();

  // Redirect to the return_url, remount, poll, success.
  await page.waitForURL(/reservation=/, { timeout: 60_000 });
  await expect(page.getByText(/Order confirmed · 2 tickets/)).toBeVisible({
    timeout: 60_000,
  });
  const orderId = await successOrderId(page);

  // Recorded correctly: one COMPLETED PAID order with server-derived totals.
  const order = await getOrder(orderId);
  expect(order).not.toBeNull();
  expect(order!.status).toBe('COMPLETED');
  expect(order!.type).toBe('PAID');
  expect(order!.totalCents).toBe(TOTAL_CENTS);
  expect(order!.subtotalCents).toBe(QTY * GA.priceCents);
  expect(order!.feesCents).toBe(QTY * GA.feesCents);
  expect(order!.stripePaymentId).toMatch(/^pi_/);
  expect(order!.email).toBe(CONTACT.email);

  const tickets = await getTickets(orderId);
  expect(tickets).toHaveLength(QTY);
  for (const ticket of tickets) {
    expect(ticket.status).toBe('VALID');
    expect(ticket.ticketsType).toBe('PAID');
  }

  const reservation = await getReservationForOrder(orderId);
  expect(reservation?.status).toBe('CONVERTED');
  expect(reservation?.stripePaymentIntentId).toBe(order!.stripePaymentId);

  // Fresh per-test ticket type: hold fully released, exactly QTY sold.
  const inventory = await getInventory(ga.id);
  expect(inventory.sold).toBe(QTY);
  expect(inventory.reserved).toBe(0);

  // Charged correctly: Stripe agrees on amount, state, and test mode.
  if (stripeKeyAvailable()) {
    const intent = await getPaymentIntent(order!.stripePaymentId!);
    expect(intent.status).toBe('succeeded');
    expect(intent.amount).toBe(TOTAL_CENTS);
    expect(intent.currency).toBe('usd');
    expect(intent.livemode).toBe(false);
  } else {
    test.info().annotations.push({
      type: 'warning',
      description:
        'STRIPE_SECRET_KEY not set — skipped verifying the PaymentIntent on Stripe.',
    });
  }

  // The unauthenticated order page renders the purchase.
  await page.goto(`/orders/${orderId}/tickets`);
  await expect(page.getByText(event.name).first()).toBeVisible();
});
