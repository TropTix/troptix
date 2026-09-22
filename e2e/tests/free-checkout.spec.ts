import { test, expect } from '../lib/test';
import { BUYER } from '../lib/events';
import {
  openCheckout,
  addTickets,
  fillContact,
  successOrderId,
} from '../lib/checkout';
import {
  getInventory,
  getOrder,
  getTickets,
  getReservationForOrder,
} from '../lib/db';

test('free RSVP completes and records a FREE order with a valid ticket', async ({
  page,
  factory,
  chapter,
}) => {
  const event = await factory.createFreeEvent();
  const rsvp = event.ticketTypes.rsvp;

  await chapter('Pick one free ticket', async () => {
    await openCheckout(page, event.id, /RSVP/);
    await addTickets(page, rsvp.id, 1);
    await page.getByRole('button', { name: 'Continue' }).click();
  });

  await chapter('Enter buyer details and complete the RSVP', async () => {
    await fillContact(page, BUYER);
    await page.getByRole('button', { name: 'Complete RSVP' }).click();
    await expect(page.getByText(/Order confirmed · 1 ticket/)).toBeVisible({
      timeout: 30_000,
    });
  });

  const orderId = await successOrderId(page);

  await chapter('The order and ticket are recorded', async () => {
    const order = await getOrder(orderId);
    expect(order).not.toBeNull();
    expect(order!.status).toBe('COMPLETED');
    expect(order!.type).toBe('FREE');
    expect(order!.stripePaymentId).toBeNull();
    expect(order!.totalCents).toBe(0);
    expect(order!.email).toBe(BUYER.email);

    const tickets = await getTickets(orderId);
    expect(tickets).toHaveLength(1);
    expect(tickets[0].status).toBe('VALID');
    expect(tickets[0].ticketsType).toBe('FREE');

    const reservation = await getReservationForOrder(orderId);
    expect(reservation?.status).toBe('CONVERTED');

    const inventory = await getInventory(rsvp.id);
    expect(inventory.sold).toBe(1);
    expect(inventory.reserved).toBe(0);
  });

  await chapter('The ticket page opens from the confirmation', async () => {
    await page.getByRole('link', { name: /View tickets/ }).click();
    await page.waitForURL(`/orders/${orderId}/tickets`);
    await expect(page.getByText(event.name).first()).toBeVisible();
  });
});
