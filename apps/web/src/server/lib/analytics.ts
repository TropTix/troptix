import { PostHog } from 'posthog-node';
import {
  ANALYTICS_EVENTS,
  type CheckoutAnalytics,
  type OrderCompletedProps,
} from '@troptix/api/analytics';

/**
 * posthog-node implementation of the `CheckoutAnalytics` port. Same
 * per-request client pattern as `featureFlags.ts`: serverless multiplies
 * long-lived clients into leaked sockets, so create, flush (`shutdown`), and
 * discard per capture. Returns undefined when analytics is off (no key), which
 * makes every capture site a no-op.
 */
export function serverAnalytics(): CheckoutAnalytics | undefined {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return undefined;

  return {
    async orderCompleted(props: OrderCompletedProps) {
      const client = new PostHog(apiKey, {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        flushAt: 1,
        flushInterval: 0,
        requestTimeout: 3000,
      });
      try {
        client.capture({
          // With no browser identity (analytics blocked), fall back to a
          // server-only id and skip the person profile — the revenue event
          // still lands without minting a junk person.
          distinctId: props.distinctId ?? `server:${props.reservationId}`,
          event: ANALYTICS_EVENTS.orderCompleted,
          properties: {
            ...(props.sessionId ? { $session_id: props.sessionId } : {}),
            ...(props.distinctId ? {} : { $process_person_profile: false }),
            order_id: props.orderId,
            reservation_id: props.reservationId,
            event_id: props.eventId,
            order_type: props.orderType,
            total_cents: props.totalCents,
            subtotal_cents: props.subtotalCents,
            fees_cents: props.feesCents,
            ticket_count: props.ticketCount,
            revenue_usd: props.totalCents / 100,
          },
        });
      } finally {
        await client.shutdown().catch(() => {});
      }
    },
  };
}
