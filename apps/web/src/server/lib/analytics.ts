import { PostHog } from 'posthog-node';
import {
  ANALYTICS_EVENTS,
  type CheckoutAnalytics,
  type OrderCompletedProps,
} from '@troptix/api/analytics';

/**
 * Create, flush (`shutdown`), and discard a client per capture — a long-lived
 * client in serverless leaks sockets (same pattern as `featureFlags.ts`).
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
          // No browser identity (analytics blocked): a server-only id with no
          // person profile still lands the revenue event, no junk person minted.
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
