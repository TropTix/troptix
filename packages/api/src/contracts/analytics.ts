// PostHog analytics contracts: the event-name registry and the server-side
// capture port. One place for names so client and server can never drift on a
// typo'd string (mirrors the feature-flag registry pattern).
//
// Exposed as its own `@troptix/api/analytics` subpath so client components can
// import the registry value without pulling the zod contracts into the bundle
// — keep this module dependency-free.

/**
 * Checkout funnel events. Client-captured except `order_completed`, which the
 * server captures at the conversion chokepoint (authoritative revenue — it
 * fires even when the buyer closes the tab and the webhook fulfills).
 */
export const ANALYTICS_EVENTS = {
  /** Buyer tapped Get Tickets / RSVP — the checkout sheet opened. */
  checkoutOpened: 'checkout_opened',
  /** Buyer picked quantities and continued to contact details. */
  checkoutTicketsSelected: 'checkout_tickets_selected',
  /** A hold was taken (createReservation succeeded with any quantity). */
  checkoutReservationCreated: 'checkout_reservation_created',
  /** Every requested quantity came back zero — nothing to sell. */
  checkoutSoldOut: 'checkout_sold_out',
  /** The Stripe Payment Element opened. */
  checkoutPaymentStarted: 'checkout_payment_started',
  /** Buyer reached the success screen (client-side view of conversion). */
  checkoutCompleted: 'checkout_completed',
  /** The hold expired before payment finished. */
  checkoutExpired: 'checkout_expired',
  /** Paid after sell-out — auto-refunded (the expiry race, ADR 0018). */
  checkoutRefunded: 'checkout_refunded',
  /** Buyer closed the sheet mid-funnel (select/contact/payment). */
  checkoutAbandoned: 'checkout_abandoned',
  /** Server-side conversion — the order materialized. Fires exactly once. */
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
  /**
   * The buyer's browser identity captured at hold time. When present, the
   * capture joins the buyer's person, funnel, and session replay; when null
   * (analytics blocked) the implementation falls back to a server-only id.
   */
  distinctId: string | null;
  sessionId: string | null;
}

/**
 * Server-side capture port. Injected like the Stripe client (never imported in
 * services) so `@troptix/api` stays free of the posthog-node dependency and
 * unit tests can assert captures with a fake. A returned promise is awaited so
 * serverless functions flush before freezing; rejections are swallowed by the
 * caller — a capture can never fail the checkout.
 */
export interface CheckoutAnalytics {
  orderCompleted(props: OrderCompletedProps): void | Promise<void>;
}
