import { z } from 'zod';

// Organizer dashboard contracts — the DTOs each screen needs, derived from
// docs/plans/2026-07-organizer-dashboard-ux.md.
//
// Conventions:
//  - **Money is integer cents** everywhere; the web layer formats at the edge.
//    "Revenue" is always Ticket revenue (Σ Order.subtotal over COMPLETED
//    orders) — pre-fee, pre-refund. A buyer's Order.total is "amount charged",
//    a deliberately different number (see CONTEXT.md "Money").
//  - Timestamps are ISO strings; day-bucketed series use `yyyy-mm-dd`.
//  - Inventory is `sold` / `capacity` (reservation-era columns).

export const eventStatusSchema = z.enum([
  'Draft',
  'Upcoming',
  'Active',
  'Past',
]);
export type EventStatus = z.infer<typeof eventStatusSchema>;

export const ticketSaleStateSchema = z.enum(['Scheduled', 'OnSale', 'Ended']);
export type TicketSaleState = z.infer<typeof ticketSaleStateSchema>;

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

// --- Screen A: dashboard home -------------------------------------------------

/**
 * An event as a card: the shape Screen A's active-events row and Screen B's
 * list both render. One schema — they're the same card in two places.
 */
export const organizerEventSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  thumbnailUrl: z.string().nullable(),
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

/** Drives the home screen's setup banner; empty banner when both are satisfied. */
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

// --- Screen B: events list ----------------------------------------------------

export const listEventsInputSchema = viewAsInputSchema.extend({
  status: eventStatusSchema.optional(),
  search: z.string().optional(),
});
export type ListEventsInput = z.infer<typeof listEventsInputSchema>;

// Rows are `organizerEventSummarySchema` — the same event card Screen A renders.

// --- Screen C: event overview -------------------------------------------------

export const eventVitalsSchema = z.object({
  sold: z.number().int(),
  capacity: z.number().int(),
  /** Ticket revenue (Σ subtotal, COMPLETED). */
  revenueCents: z.number().int(),
  ordersCount: z.number().int(),
});
export type EventVitals = z.infer<typeof eventVitalsSchema>;

export const dailyRevenueSchema = z.object({
  /** yyyy-mm-dd */
  date: z.string(),
  revenueCents: z.number().int(),
  tickets: z.number().int(),
});
export type DailyRevenue = z.infer<typeof dailyRevenueSchema>;

export const ticketTypeBreakdownSchema = z.object({
  id: z.string(),
  name: z.string(),
  sold: z.number().int(),
  capacity: z.number().int(),
  revenueCents: z.number().int(),
});
export type TicketTypeBreakdown = z.infer<typeof ticketTypeBreakdownSchema>;

export const checkInSummarySchema = z.object({
  checkedIn: z.number().int(),
  total: z.number().int(),
});
export type CheckInSummary = z.infer<typeof checkInSummarySchema>;

export const organizerEventOverviewSchema = z.object({
  event: z.object({
    id: z.string(),
    name: z.string(),
    status: eventStatusSchema,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    venue: z.string().nullable(),
  }),
  vitals: eventVitalsSchema,
  dailyRevenue: z.array(dailyRevenueSchema),
  ticketBreakdown: z.array(ticketTypeBreakdownSchema),
  checkIn: checkInSummarySchema,
  recentOrders: z.array(dashboardRecentOrderSchema),
});
export type OrganizerEventOverview = z.infer<
  typeof organizerEventOverviewSchema
>;

// --- Screen E: ticket types ---------------------------------------------------
// Tiers come back in natural (creation) order — reorder is deferred.

export const organizerTicketTierSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceCents: z.number().int(),
  sold: z.number().int(),
  capacity: z.number().int(),
  saleState: ticketSaleStateSchema,
  revenueCents: z.number().int(),
  /** A gated tier is hidden behind a code; the code itself never leaves the server. */
  gated: z.boolean(),
});
export type OrganizerTicketTier = z.infer<typeof organizerTicketTierSchema>;

export const organizerTicketTypesSchema = z.object({
  summary: z.object({
    sold: z.number().int(),
    revenueCents: z.number().int(),
  }),
  tiers: z.array(organizerTicketTierSchema),
});
export type OrganizerTicketTypes = z.infer<typeof organizerTicketTypesSchema>;

// --- Screen F: attendees + check-in -------------------------------------------

export const listAttendeesInputSchema = z.object({
  eventId: z.string().min(1),
  search: z.string().optional(),
  checkedIn: z.boolean().optional(),
});
export type ListAttendeesInput = z.infer<typeof listAttendeesInputSchema>;

export const organizerAttendeeSchema = z.object({
  ticketId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  ticketType: z.string(),
  orderId: z.string().nullable(),
  checkedIn: z.boolean(),
  checkedInAt: z.string().datetime().nullable(),
});
export type OrganizerAttendee = z.infer<typeof organizerAttendeeSchema>;

export const organizerAttendeesSchema = z.object({
  attendees: z.array(organizerAttendeeSchema),
  summary: checkInSummarySchema,
});
export type OrganizerAttendees = z.infer<typeof organizerAttendeesSchema>;

// --- Screen G: orders ---------------------------------------------------------

export const listOrdersInputSchema = z.object({
  eventId: z.string().min(1),
  search: z.string().optional(),
  status: orderStatusSchema.optional(),
});
export type ListOrdersInput = z.infer<typeof listOrdersInputSchema>;

/** The dashboard's recent-order row, plus the count the orders table shows. */
export const organizerOrderSummarySchema = dashboardRecentOrderSchema.extend({
  ticketCount: z.number().int(),
});
export type OrganizerOrderSummary = z.infer<typeof organizerOrderSummarySchema>;

export const orderLineItemSchema = z.object({
  ticketTypeName: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  subtotalCents: z.number().int(),
});
export type OrderLineItem = z.infer<typeof orderLineItemSchema>;

export const orderTimelineEntrySchema = z.object({
  label: z.string(),
  at: z.string().datetime(),
});
export type OrderTimelineEntry = z.infer<typeof orderTimelineEntrySchema>;

export const organizerOrderDetailSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  /** Nullable because `Orders.createdAt` still is (roadmap 2.9). */
  createdAt: z.string().datetime().nullable(),
  customer: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
  }),
  lineItems: z.array(orderLineItemSchema),
  /** Ticket revenue for this order; `total = subtotal + fees`. */
  subtotalCents: z.number().int(),
  feesCents: z.number().int(),
  totalCents: z.number().int(),
  payment: z.object({
    cardType: z.string().nullable(),
    cardLast4: z.string().nullable(),
  }),
  timeline: z.array(orderTimelineEntrySchema),
});
export type OrganizerOrderDetail = z.infer<typeof organizerOrderDetailSchema>;

// --- Screen I: organizer profile & settings -----------------------------------

export const organizerProfileSchema = z.object({
  id: z.string(),
  slug: z.string(),
  displayName: z.string(),
  logoUrl: z.string().nullable(),
  bio: z.string().nullable(),
  website: z.string().nullable(),
  instagram: z.string().nullable(),
  twitter: z.string().nullable(),
  linkedin: z.string().nullable(),
  /** Admin-granted attendee trust tick — orthogonal to paid ticketing. */
  verified: z.boolean(),
  /** Admin-granted capability to sell paid tickets (ADR 0019). */
  paidTicketingEnabled: z.boolean(),
  /** Set when the organizer has asked to be approved; null if never requested. */
  paidTicketingRequestedAt: z.string().datetime().nullable(),
});
export type OrganizerProfile = z.infer<typeof organizerProfileSchema>;

// --- Screen H: admin index ----------------------------------------------------
// Deliberately stat-free — the cross-organizer god-list was deleted, not ported.

export const adminEventIndexRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: eventStatusSchema,
  startsAt: z.string().datetime(),
  owner: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
  }),
});
export type AdminEventIndexRow = z.infer<typeof adminEventIndexRowSchema>;
