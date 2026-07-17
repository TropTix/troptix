import { z } from 'zod';

// Organizer dashboard contracts, derived from
// docs/plans/2026-07-organizer-dashboard-ux.md. Each screen's DTOs land with
// the PR that builds that screen.
//
// Conventions:
//  - **Money is integer cents** everywhere; the web layer formats at the edge.
//    "Revenue" is always Ticket revenue (Σ Order.subtotal over COMPLETED
//    orders) — pre-fee, pre-refund. A buyer's Order.total is "amount charged",
//    a deliberately different number (see CONTEXT.md "Money").
//  - Timestamps are ISO strings; day-bucketed series use `yyyy-mm-dd`.
//  - Inventory is `sold` / `capacity`.

export const eventStatusSchema = z.enum([
  'Draft',
  'Upcoming',
  'Active',
  'Past',
]);
export type EventStatus = z.infer<typeof eventStatusSchema>;

export const orderStatusSchema = z.enum(['PENDING', 'CANCELLED', 'COMPLETED']);
export type OrderStatusDto = z.infer<typeof orderStatusSchema>;

/**
 * View-as: a Platform Owner may scope a **read** to another organizer
 * (ADR 0018). Ignored for non-platform-owners; never accepted by writes.
 */
export const viewAsInputSchema = z.object({
  viewAsOrganizerUserId: z.string().min(1).optional(),
});
export type ViewAsInput = z.infer<typeof viewAsInputSchema>;

/**
 * The window the dashboard's stats and sales chart cover. Rolling, not calendar:
 * `week`/`month` are the last 7/30 days through today.
 *
 * Boundaries are UTC — the organizer's own timezone isn't modelled yet, so
 * "today" means the UTC day (worth revisiting for far-from-UTC organizers).
 */
export const dashboardRangeSchema = z.enum([
  'today',
  'yesterday',
  'week',
  'month',
]);
export type DashboardRange = z.infer<typeof dashboardRangeSchema>;

export const dashboardInputSchema = viewAsInputSchema.extend({
  range: dashboardRangeSchema.optional(),
});
export type DashboardInput = z.infer<typeof dashboardInputSchema>;

/**
 * An event as a card — the shape both the dashboard's active-events row and the
 * events list (Screen B) render, so a card looks the same wherever it appears.
 */
export const organizerEventSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Stored flyer path (resolved to an absolute URL by the web layer). */
  imageUrl: z.string().nullable(),
  startsAt: z.string().datetime(),
  sold: z.number().int(),
  capacity: z.number().int(),
  status: eventStatusSchema,
});
export type OrganizerEventSummary = z.infer<typeof organizerEventSummarySchema>;

export const dashboardRecentOrderSchema = z.object({
  id: z.string(),
  /** Name, falling back to email, falling back to 'N/A'. */
  customerDisplay: z.string(),
  /** What the buyer paid (Order.total) — not revenue. */
  amountChargedCents: z.number().int(),
  /** Nullable because `Orders.createdAt` still is (roadmap 2.9). */
  createdAt: z.string().datetime().nullable(),
  status: orderStatusSchema,
});
export type DashboardRecentOrder = z.infer<typeof dashboardRecentOrderSchema>;

export const salesPointSchema = z.object({
  /** Bucket start, ISO. Hourly for today/yesterday, daily for week/month. */
  at: z.string().datetime(),
  tickets: z.number().int(),
});
export type SalesPoint = z.infer<typeof salesPointSchema>;

/** Drives the home screen's setup banner; no banner when both are satisfied. */
export const organizerSetupStateSchema = z.object({
  profileComplete: z.boolean(),
  paidTicketingEnabled: z.boolean(),
});
export type OrganizerSetupState = z.infer<typeof organizerSetupStateSchema>;

export const organizerDashboardSchema = z.object({
  /** Echoed back so the UI can render the selector from the resolved range. */
  range: dashboardRangeSchema,
  /** Scoped to `range` — not all-time. */
  stats: z.object({
    revenueCents: z.number().int(),
    ticketsSold: z.number().int(),
  }),
  /** Zero-filled across the whole range, so the chart has no gaps. */
  salesSeries: z.array(salesPointSchema),
  /** Current state, deliberately NOT range-scoped — an event is active now. */
  activeEvents: z.array(organizerEventSummarySchema),
  /** The latest orders, deliberately NOT range-scoped. */
  recentOrders: z.array(dashboardRecentOrderSchema),
  setup: organizerSetupStateSchema,
});
export type OrganizerDashboard = z.infer<typeof organizerDashboardSchema>;

// --- Screen C — event overview (`/organizer/events/[id]`) ---

/** The event's headline numbers. Money is cents; `sold` is against `capacity`. */
export const eventVitalsSchema = z.object({
  sold: z.number().int(),
  capacity: z.number().int(),
  revenueCents: z.number().int(),
  ordersCount: z.number().int(),
});
export type EventVitals = z.infer<typeof eventVitalsSchema>;

/** A day on the event's revenue-over-time chart. Zero-filled, so no gaps. */
export const eventRevenuePointSchema = z.object({
  /** Day start, ISO (UTC — same caveat as the dashboard series). */
  at: z.string().datetime(),
  revenueCents: z.number().int(),
  tickets: z.number().int(),
});
export type EventRevenuePoint = z.infer<typeof eventRevenuePointSchema>;

/** One ticket tier's inventory + its share of Ticket revenue. */
export const eventTierBreakdownSchema = z.object({
  id: z.string(),
  name: z.string(),
  sold: z.number().int(),
  capacity: z.number().int(),
  /** Σ of this tier's completed-ticket subtotals (reconciles to event revenue). */
  revenueCents: z.number().int(),
});
export type EventTierBreakdown = z.infer<typeof eventTierBreakdownSchema>;

/** Door progress: how many of the event's tickets have been checked in. */
export const checkInSummarySchema = z.object({
  checkedIn: z.number().int(),
  total: z.number().int(),
});
export type CheckInSummary = z.infer<typeof checkInSummarySchema>;

export const eventOverviewSchema = z.object({
  event: z.object({
    id: z.string(),
    name: z.string(),
    status: eventStatusSchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().nullable(),
    venue: z.string().nullable(),
  }),
  vitals: eventVitalsSchema,
  /** Daily, from event creation through today (capped) — zero-filled. */
  revenueSeries: z.array(eventRevenuePointSchema),
  tiers: z.array(eventTierBreakdownSchema),
  checkIn: checkInSummarySchema,
  /** A short peek; the Orders tab is the full surface. NOT range-scoped. */
  recentOrders: z.array(dashboardRecentOrderSchema),
});
export type EventOverview = z.infer<typeof eventOverviewSchema>;
