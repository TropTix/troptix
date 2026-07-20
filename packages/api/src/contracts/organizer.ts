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
  /** The order's event, so a cross-event rail can link into its detail. */
  eventId: z.string(),
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

/** One ticket type's inventory + its share of Ticket revenue. */
export const ticketTypeBreakdownSchema = z.object({
  id: z.string(),
  name: z.string(),
  sold: z.number().int(),
  capacity: z.number().int(),
  /**
   * Σ of this ticket type's completed-ticket subtotals. Close to — but not guaranteed
   * equal to — the event's Ticket revenue: that's Σ Order.subtotal, a different
   * column, and each is rounded to cents at its own granularity.
   */
  revenueCents: z.number().int(),
});
export type TicketTypeBreakdown = z.infer<typeof ticketTypeBreakdownSchema>;

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
  ticketTypes: z.array(ticketTypeBreakdownSchema),
  checkIn: checkInSummarySchema,
  /** A short peek; the Orders tab is the full surface. NOT range-scoped. */
  recentOrders: z.array(dashboardRecentOrderSchema),
});
export type EventOverview = z.infer<typeof eventOverviewSchema>;

// --- Screen G — orders (`/organizer/events/[id]/orders`) ---

/** A row in the orders list. */
export const eventOrderRowSchema = z.object({
  id: z.string(),
  customerDisplay: z.string(),
  /** What the buyer paid (Order.total). */
  amountChargedCents: z.number().int(),
  ticketCount: z.number().int(),
  createdAt: z.string().datetime().nullable(),
  status: orderStatusSchema,
});
export type EventOrderRow = z.infer<typeof eventOrderRowSchema>;

/** One ticket type's slice of an order — the tickets bought at a single price. */
export const orderLineItemSchema = z.object({
  /** Ticket type name, or 'Ticket' when the ticketType is gone/unknown. */
  name: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  subtotalCents: z.number().int(),
});
export type OrderLineItem = z.infer<typeof orderLineItemSchema>;

/**
 * A single order in full. Money is cents throughout; the breakdown prefers the
 * reservation-era `*Cents` columns and falls back to the legacy float columns
 * for orders written before that cutover.
 */
export const orderDetailSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  /** Placed. A fuller placed→paid→emailed timeline needs event sourcing we
   * don't store yet, so it's deferred rather than faked. */
  createdAt: z.string().datetime().nullable(),
  customer: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  lineItems: z.array(orderLineItemSchema),
  subtotalCents: z.number().int(),
  feesCents: z.number().int(),
  totalCents: z.number().int(),
  /** e.g. "Visa ····4242", or null for free/legacy orders. */
  paymentMethod: z.string().nullable(),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

// --- Screen E — ticket types (`/organizer/events/[id]/tickets`) ---

/** Where a ticketType sits in its sale window. */
export const saleStateSchema = z.enum(['Scheduled', 'OnSale', 'Ended']);
export type SaleState = z.infer<typeof saleStateSchema>;

/**
 * A ticketType row on the ticket-types screen: the same inventory + revenue shape the
 * event overview shows, plus the price and sale-window state this screen manages.
 */
export const ticketTypeRowSchema = ticketTypeBreakdownSchema.extend({
  /** The price the organizer set. What they earn per ticket under PASS. */
  grossPriceCents: z.number().int(),
  /**
   * What the attendee is actually charged: gross + fee when the type passes
   * fees on, gross when it absorbs them (the organizer eats the fee instead).
   * Equal to `grossPriceCents` for free types, since a $0 ticket has no fee.
   */
  displayPriceCents: z.number().int(),
  saleState: saleStateSchema,
  /** Venue-local sale window (ADR 0021). Both are always set. */
  saleStartsAt: z.string().datetime(),
  saleEndsAt: z.string().datetime(),
});
export type TicketTypeRow = z.infer<typeof ticketTypeRowSchema>;

// --- Screen D — create / edit event (write inputs) ---
//
// Unlike the read DTOs above (ISO strings over the wire), these are inputs to
// in-process service calls that hand Dates straight to Prisma, so timestamps
// are `z.date()`. Money stays integer cents; the service derives the legacy
// float during the 2.12 cutover.

export const ticketTypeInputSchema = z
  .object({
    name: z.string().min(3),
    description: z.string().optional(),
    /** Gross price the organizer set. 0 = FREE/RSVP; > 0 requires the paid gate. */
    priceCents: z.number().int().min(0),
    capacity: z.number().int().positive(),
    maxPurchasePerUser: z.number().int().positive(),
    saleStartsAt: z.date(),
    saleEndsAt: z.date(),
    ticketingFees: z.enum(['ABSORB_TICKET_FEES', 'PASS_TICKET_FEES']),
  })
  .refine((t) => t.saleEndsAt > t.saleStartsAt, {
    message: 'Sale end must be after sale start.',
    path: ['saleEndsAt'],
  });
export type TicketTypeInput = z.infer<typeof ticketTypeInputSchema>;

const eventFieldsSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional(),
  startsAt: z.date(),
  endsAt: z.date(),
  venue: z.string().min(1),
  address: z.string().min(5),
  country: z.string().optional(),
  countryCode: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  /** Stored flyer path, not a URL (ADR 0016). Empty/null means no image. */
  imageUrl: z.string().nullable().optional(),
});

// One home for the temporal rule, so create and update can't drift apart.
const eventEndsAfterStart = [
  (e: { startsAt: Date; endsAt: Date }) => e.endsAt > e.startsAt,
  { message: 'Event must end after it starts.', path: ['endsAt'] },
] as const;

export const createEventInputSchema = eventFieldsSchema
  .extend({
    ticketTypes: z.array(ticketTypeInputSchema).optional(),
  })
  .refine(...eventEndsAfterStart);
export type CreateEventInput = z.infer<typeof createEventInputSchema>;

/**
 * Event fields only — ticket-type editing is Screen E's seam (#452), so
 * `updateEvent` deliberately takes no ticket types (see #465).
 */
export const updateEventInputSchema = eventFieldsSchema.refine(
  ...eventEndsAfterStart
);
export type UpdateEventInput = z.infer<typeof updateEventInputSchema>;

export const ticketTypesViewSchema = z.object({
  /** Natural (creation) order — reordering is deferred (see the UX plan). */
  ticketTypes: z.array(ticketTypeRowSchema),
  /**
   * Header summary — the sum of the rows, so it agrees with the table below it.
   * Its `revenueCents` (Σ Tickets.subtotal) is the same basis as the per-type
   * rows, but ≈ — not guaranteed cent-equal to — the "Ticket revenue" the
   * dashboard and event overview report (Σ Order.subtotal, a different column).
   */
  summary: z.object({
    sold: z.number().int(),
    capacity: z.number().int(),
    revenueCents: z.number().int(),
    /** How many types are selling right now — the at-a-glance "is anything live". */
    onSale: z.number().int(),
  }),
});
export type TicketTypesView = z.infer<typeof ticketTypesViewSchema>;
