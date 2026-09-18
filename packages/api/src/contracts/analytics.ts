// Served on its own `@troptix/api/analytics` subpath so client components can
// import it without pulling zod into the bundle — keep this module dependency-free.

/**
 * Checkout funnel events. Client-captured except `order_completed` — server-only,
 * so it fires even when the buyer closes the tab and the webhook fulfills.
 */
export const ANALYTICS_EVENTS = {
  checkoutOpened: 'checkout_opened',
  checkoutTicketsSelected: 'checkout_tickets_selected',
  checkoutReservationCreated: 'checkout_reservation_created',
  /** Every requested quantity came back zero — not fired on a partial grant. */
  checkoutSoldOut: 'checkout_sold_out',
  checkoutPaymentStarted: 'checkout_payment_started',
  checkoutCompleted: 'checkout_completed',
  checkoutExpired: 'checkout_expired',
  /** Only the paid-after-sell-out auto-refund (ADR 0018) — not support refunds. */
  checkoutRefunded: 'checkout_refunded',
  checkoutAbandoned: 'checkout_abandoned',
  orderCompleted: 'order_completed',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export interface OrderCompletedProps {
  orderId: string;
  reservationId: string;
  eventId: string;
  orderType: 'FREE' | 'PAID';
  totalCents: number;
  subtotalCents: number;
  feesCents: number;
  ticketCount: number;
  /** Null (analytics blocked) makes the implementation fall back to a server-only id. */
  distinctId: string | null;
  sessionId: string | null;
}

/**
 * A returned promise is awaited so serverless functions flush before freezing;
 * rejections are swallowed by the caller — a capture can never fail the checkout.
 */
export interface CheckoutAnalytics {
  orderCompleted(props: OrderCompletedProps): void | Promise<void>;
}
