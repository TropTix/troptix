import { test, expect, CONTACT } from '../lib/testEvent';
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

test('free RSVP completes inline and records a FREE order', async ({
  page,
  factory,
}) => {
  const event = await factory.createFreeEvent();
  const rsvp = event.ticketTypes.rsvp;

  await openCheckout(page, event.id, /RSVP/);
  await addTickets(page, rsvp.id, 1);
  await page.getByRole('button', { name: 'Continue' }).click();

  await fillContact(page, CONTACT);
  await page.getByRole('button', { name: 'Complete RSVP' }).click();

  await expect(page.getByText(/Order confirmed · 1 ticket/)).toBeVisible({
    timeout: 30_000,
  });
  const orderId = await successOrderId(page);

  const order = await getOrder(orderId);
  expect(order).not.toBeNull();
  expect(order!.status).toBe('COMPLETED');
  expect(order!.type).toBe('FREE');
  expect(order!.stripePaymentId).toBeNull();
  expect(order!.totalCents).toBe(0);
  expect(order!.email).toBe(CONTACT.email);

  const tickets = await getTickets(orderId);
  expect(tickets).toHaveLength(1);
  expect(tickets[0].status).toBe('VALID');
  expect(tickets[0].ticketsType).toBe('FREE');

  const reservation = await getReservationForOrder(orderId);
  expect(reservation?.status).toBe('CONVERTED');

  // Fresh per-test ticket type, so counters are absolute.
  const inventory = await getInventory(rsvp.id);
  expect(inventory.sold).toBe(1);
  expect(inventory.reserved).toBe(0);
});
