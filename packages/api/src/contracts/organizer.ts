import { z } from 'zod';
import { eventPageThemeSchema, flyerPaletteSchema } from './events';

// "Revenue" is Ticket revenue (Σ Order.subtotal over COMPLETED orders), pre-fee,
// pre-refund — deliberately not Order.total ("amount charged"; CONTEXT.md "Money").

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
 * Rolling, not calendar: `week`/`month` are the last 7/30 days through today.
 * Boundaries are UTC — the organizer's timezone isn't modelled.
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

export const organizerEventSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Stored flyer path (resolved to an absolute URL by the web layer). */
  imageUrl: z.string().nullable(),
  startsAt: z.string().datetime(),
  sold: z.number().int(),
  capacity: z.number().int(),
  status: eventStatusSchema,
  isPrivate: z.boolean(),
});
export type OrganizerEventSummary = z.infer<typeof organizerEventSummarySchema>;

export const dashboardRecentOrderSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  customerDisplay: z.string(),
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

export const organizerSetupStateSchema = z.object({
  profileComplete: z.boolean(),
  paidTicketingEnabled: z.boolean(),
});
export type OrganizerSetupState = z.infer<typeof organizerSetupStateSchema>;

export const organizerDashboardSchema = z.object({
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

export const eventVitalsSchema = z.object({
  sold: z.number().int(),
  capacity: z.number().int(),
  revenueCents: z.number().int(),
  ordersCount: z.number().int(),
});
export type EventVitals = z.infer<typeof eventVitalsSchema>;

export const eventRevenuePointSchema = z.object({
  /** Day start, ISO, UTC. */
  at: z.string().datetime(),
  revenueCents: z.number().int(),
  tickets: z.number().int(),
});
export type EventRevenuePoint = z.infer<typeof eventRevenuePointSchema>;

export const ticketTypeBreakdownSchema = z.object({
  id: z.string(),
  name: z.string(),
  sold: z.number().int(),
  capacity: z.number().int(),
  /** Σ this type's completed-ticket subtotals — close to, but not guaranteed
   * cent-equal to, the event's Ticket revenue (Σ Order.subtotal, a different column). */
  revenueCents: z.number().int(),
});
export type TicketTypeBreakdown = z.infer<typeof ticketTypeBreakdownSchema>;

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
  recentOrders: z.array(dashboardRecentOrderSchema),
});
export type EventOverview = z.infer<typeof eventOverviewSchema>;

export const eventOrderRowSchema = z.object({
  id: z.string(),
  customerDisplay: z.string(),
  amountChargedCents: z.number().int(),
  ticketCount: z.number().int(),
  createdAt: z.string().datetime().nullable(),
  status: orderStatusSchema,
});
export type EventOrderRow = z.infer<typeof eventOrderRowSchema>;

export const orderLineItemSchema = z.object({
  /** Falls back to 'Ticket' when the ticketType is gone/unknown. */
  name: z.string(),
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  subtotalCents: z.number().int(),
});
export type OrderLineItem = z.infer<typeof orderLineItemSchema>;

export const orderDetailSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
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
  paymentMethod: z.string().nullable(),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

export const saleStateSchema = z.enum(['Scheduled', 'OnSale', 'Ended']);
export type SaleState = z.infer<typeof saleStateSchema>;

export const ticketTypeRowSchema = ticketTypeBreakdownSchema.extend({
  /** The price the organizer set — not necessarily what the attendee pays. */
  grossPriceCents: z.number().int(),
  /** What the attendee is charged: gross + fee under PASS, gross under ABSORB. */
  displayPriceCents: z.number().int(),
  saleState: saleStateSchema,
  /** Venue-local (ADR 0021). */
  saleStartsAt: z.string().datetime(),
  saleEndsAt: z.string().datetime(),
  description: z.string(),
  maxPurchasePerUser: z.number().int(),
  ticketingFees: z.enum(['ABSORB_TICKET_FEES', 'PASS_TICKET_FEES']),
  discountCode: z.string().nullable(),
});
export type TicketTypeRow = z.infer<typeof ticketTypeRowSchema>;

// Unlike the read DTOs above (ISO strings over the wire), the write inputs below
// feed in-process service calls that hand Dates straight to Prisma, so timestamps are `z.date()`.

export const ticketTypeInputSchema = z
  .object({
    name: z.string().min(3),
    description: z.string().optional(),
    priceCents: z.number().int().min(0),
    capacity: z.number().int().positive(),
    maxPurchasePerUser: z.number().int().positive(),
    saleStartsAt: z.date(),
    saleEndsAt: z.date(),
    ticketingFees: z.enum(['ABSORB_TICKET_FEES', 'PASS_TICKET_FEES']),
    discountCode: z.string().optional(),
  })
  .refine((t) => t.saleEndsAt > t.saleStartsAt, {
    message: 'Sale end must be after sale start.',
    path: ['saleEndsAt'],
  });
export type TicketTypeInput = z.infer<typeof ticketTypeInputSchema>;

const eventFieldsSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional(),
  isPrivate: z.boolean().optional(),
  startsAt: z.date(),
  endsAt: z.date(),
  venue: z.string().min(1),
  address: z.string().min(5),
  country: z.string().optional(),
  countryCode: z.string().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  /** Stored flyer path, not a URL (ADR 0016). */
  imageUrl: z.string().nullable().optional(),
  pageTheme: eventPageThemeSchema.optional(),
  flyerPalette: flyerPaletteSchema.nullable().optional(),
});

const eventEndsAfterStart: [
  (e: { startsAt: Date; endsAt: Date }) => boolean,
  { message: string; path: string[] },
] = [
  (e) => e.endsAt > e.startsAt,
  { message: 'Event must end after it starts.', path: ['endsAt'] },
];

export const createEventInputSchema = eventFieldsSchema
  .extend({
    ticketTypes: z.array(ticketTypeInputSchema).optional(),
  })
  .refine(...eventEndsAfterStart);
export type CreateEventInput = z.infer<typeof createEventInputSchema>;

/** Deliberately takes no ticket types — ticket-type editing is its own seam (#452, #465). */
export const updateEventInputSchema = eventFieldsSchema.refine(
  ...eventEndsAfterStart
);
export type UpdateEventInput = z.infer<typeof updateEventInputSchema>;

export const ticketTypesViewSchema = z.object({
  eventEndsAt: z.string().datetime(),
  ticketTypes: z.array(ticketTypeRowSchema),
  /** Sum of the rows, so it agrees with the table. Its `revenueCents` (Σ Tickets.subtotal)
   * is ≈, not guaranteed cent-equal to, dashboard Ticket revenue (Σ Order.subtotal). */
  summary: z.object({
    sold: z.number().int(),
    capacity: z.number().int(),
    revenueCents: z.number().int(),
    onSale: z.number().int(),
  }),
});
export type TicketTypesView = z.infer<typeof ticketTypesViewSchema>;
