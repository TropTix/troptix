import { test, expect } from '../lib/test';
import { BUYER, GA } from '../lib/events';
import {
  CARDS,
  checkoutStep,
  openCheckout,
  addTickets,
  fillContact,
  fillCard,
  reservationIdFromUrl,
  successOrderId,
} from '../lib/checkout';
import {
  countOrdersForEvent,
  getInventory,
  getOrder,
  getReservation,
  getTickets,
  getReservationForOrder,
} from '../lib/db';
import { getPaymentIntent } from '../lib/stripe';

// 2 × GA at $25.00 + $2.50 fees = $55.00. confirm() resolves in place and the
// client makes one checkout.finalizePayment call (ADR 0030); no webhook is
// involved. Stripe is the fake server, so "Stripe agrees" checks what the app
// asked Stripe to charge.
test('paid checkout charges the card and records the order', async ({
  page,
  factory,
}) => {
  const QTY = 2;
  const TOTAL_CENTS = QTY * (GA.priceCents + GA.feesCents);
  const event = await factory.createPaidEvent();
  const ga = event.ticketTypes.ga;

  await test.step('Pick 2 General Admission tickets', async () => {
    await openCheckout(page, event.id, /Get Tickets/);
    await addTickets(page, ga.id, QTY);
    await page.getByRole('button', { name: 'Continue' }).click();
  });

  await test.step('Enter buyer details', async () => {
    await fillContact(page, BUYER);
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(page.getByText(/Held for \d+:\d\d/)).toBeVisible();
  });

  await test.step('Pay $55.00 with a test card', async () => {
    await fillCard(page, CARDS.success);
    await page.getByRole('button', { name: /^Pay \$55\.00/ }).click();
    await expect(page.getByText(/Order confirmed · 2 tickets/)).toBeVisible({
      timeout: 30_000,
    });
  });

  const orderId = await successOrderId(page);

  await test.step('The order, tickets and inventory are recorded', async () => {
    const order = await getOrder(orderId);
    expect(order).not.toBeNull();
    expect(order!.status).toBe('COMPLETED');
    expect(order!.type).toBe('PAID');
    expect(order!.totalCents).toBe(TOTAL_CENTS);
    expect(order!.subtotalCents).toBe(QTY * GA.priceCents);
    expect(order!.feesCents).toBe(QTY * GA.feesCents);
    expect(order!.stripePaymentId).toMatch(/^pi_/);
    expect(order!.email).toBe(BUYER.email);

    const tickets = await getTickets(orderId);
    expect(tickets).toHaveLength(QTY);
    for (const ticket of tickets) {
      expect(ticket.status).toBe('VALID');
      expect(ticket.ticketsType).toBe('PAID');
    }

    const reservation = await getReservationForOrder(orderId);
    expect(reservation?.status).toBe('CONVERTED');
    expect(reservation?.stripePaymentIntentId).toBe(order!.stripePaymentId);

    const inventory = await getInventory(ga.id);
    expect(inventory.sold).toBe(QTY);
    expect(inventory.reserved).toBe(0);
  });

  await test.step('Stripe was asked to charge $55.00 and the PaymentIntent succeeded', async () => {
    const order = await getOrder(orderId);
    const intent = await getPaymentIntent(order!.stripePaymentId!);
    expect(intent.status).toBe('succeeded');
    expect(intent.amount).toBe(TOTAL_CENTS);
    expect(intent.currency).toBe('usd');
    expect(intent.livemode).toBe(false);
  });

  await test.step('The ticket page opens from the confirmation', async () => {
    await page.getByRole('link', { name: /View tickets/ }).click();
    await page.waitForURL(`/orders/${orderId}/tickets`);
    await expect(page.getByText(event.name).first()).toBeVisible();
  });
});

test('a declined card shows the error, keeps the hold, and a retry succeeds', async ({
  page,
  factory,
}) => {
  const event = await factory.createPaidEvent();
  const ga = event.ticketTypes.ga;

  await test.step('Pick 1 ticket and reach payment', async () => {
    await openCheckout(page, event.id, /Get Tickets/);
    await addTickets(page, ga.id, 1);
    await page.getByRole('button', { name: 'Continue' }).click();
    await fillContact(page, BUYER);
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await expect(page.getByText(/Held for \d+:\d\d/)).toBeVisible();
  });

  const reservationId = reservationIdFromUrl(page);

  await test.step('Pay with a card that is declined', async () => {
    await fillCard(page, CARDS.declined);
    await page.getByRole('button', { name: /^Pay \$27\.50/ }).click();
    await expect(page.getByText(/declined/i).first()).toBeVisible();
    await expect(checkoutStep(page, 'Payment')).toBeVisible();
    expect(page.url()).toContain(`/e/${event.id}`);
  });

  await test.step('Nothing was sold: no order, hold still in place', async () => {
    expect(await countOrdersForEvent(event.id)).toBe(0);
    const reservation = await getReservation(reservationId);
    expect(reservation?.status).toBe('HELD');
    const inventory = await getInventory(ga.id);
    expect(inventory.sold).toBe(0);
    expect(inventory.reserved).toBe(1);
  });

  await test.step('Retry with a good card succeeds', async () => {
    await fillCard(page, CARDS.success);
    const pay = page.getByRole('button', { name: /^Pay \$27\.50/ });
    await expect(pay).toBeEnabled();
    await pay.click();
    await expect(page.getByText(/Order confirmed · 1 ticket/)).toBeVisible({
      timeout: 30_000,
    });
    const orderId = await successOrderId(page);
    const order = await getOrder(orderId);
    expect(order?.status).toBe('COMPLETED');
    expect(order?.totalCents).toBe(GA.priceCents + GA.feesCents);
    const inventory = await getInventory(ga.id);
    expect(inventory.sold).toBe(1);
    expect(inventory.reserved).toBe(0);
  });
});
