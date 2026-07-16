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
 * An event as a card — the shape the dashboard's active-events row renders (and
 * the events list will reuse).
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

export const dailyTicketSalesSchema = z.object({
  /** yyyy-mm-dd */
  date: z.string(),
  tickets: z.number().int(),
});
export type DailyTicketSales = z.infer<typeof dailyTicketSalesSchema>;

/** Drives the home screen's setup banner; no banner when both are satisfied. */
export const organizerSetupStateSchema = z.object({
  profileComplete: z.boolean(),
  paidTicketingEnabled: z.boolean(),
});
export type OrganizerSetupState = z.infer<typeof organizerSetupStateSchema>;

export const organizerDashboardSchema = z.object({
  activeEvents: z.array(organizerEventSummarySchema),
  recentOrders: z.array(dashboardRecentOrderSchema),
  revenue: z.object({
    totalRevenueCents: z.number().int(),
    dailySales: z.array(dailyTicketSalesSchema),
  }),
  setup: organizerSetupStateSchema,
});
export type OrganizerDashboard = z.infer<typeof organizerDashboardSchema>;
