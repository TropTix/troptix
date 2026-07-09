import { z } from 'zod';

// Organizer dashboard DTOs. All money is integer cents (decision 4 of the
// organizer-dashboard migration); the web layer formats at the edge. Statuses
// come from the shared `EventStatus` derivation so the list and detail agree.

const eventStatusSchema = z.enum(['Draft', 'Upcoming', 'Active', 'Past']);

// --- OrganizerDashboard -------------------------------------------------------
// The `/organizer` landing: headline stat cards, a 30-day sales series, a short
// list of active events, and recent orders.

export const dashboardActiveEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Event start as an ISO date (yyyy-mm-dd). */
  date: z.string(),
  ticketsSold: z.number().int(),
  capacity: z.number().int(),
  status: eventStatusSchema,
});
export type DashboardActiveEvent = z.infer<typeof dashboardActiveEventSchema>;

export const dashboardRecentOrderSchema = z.object({
  id: z.string(),
  /** Name, falling back to email, falling back to 'N/A'. */
  customerDisplay: z.string(),
  /** What the buyer paid ("Amount charged"), integer cents. */
  amountCents: z.number().int(),
  /** Order date as an ISO date (yyyy-mm-dd). */
  date: z.string(),
  status: z.string(),
});
export type DashboardRecentOrder = z.infer<typeof dashboardRecentOrderSchema>;

export const dashboardDailySalesSchema = z.object({
  /** ISO date (yyyy-mm-dd). */
  date: z.string(),
  tickets: z.number().int(),
});
export type DashboardDailySales = z.infer<typeof dashboardDailySalesSchema>;

export const organizerDashboardSchema = z.object({
  /** Ticket revenue: Σ Order.subtotal over COMPLETED orders, integer cents. */
  revenueCents: z.number().int(),
  ticketsSold: z.number().int(),
  activeEventsCount: z.number().int(),
  dailySales: z.array(dashboardDailySalesSchema),
  activeEvents: z.array(dashboardActiveEventSchema),
  recentOrders: z.array(dashboardRecentOrderSchema),
});
export type OrganizerDashboard = z.infer<typeof organizerDashboardSchema>;
