import { PrismaClient, OrderStatus, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export const getOrganizerDashboardDataOptimized = async (
  organizerUserId: string
) => {
  // --- Date Setup ---
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30); // Go back 30 days
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  // --- Run Queries Concurrently ---
  const [
    revenueResult,
    ticketsSoldResult,
    activeEventsCountResult,
    dailySalesGrouped,
    activeEventsRaw,
    recentOrdersRaw,
  ] = await Promise.all([
    // 1. Total Revenue
    prisma.orders.aggregate({
      _sum: { subtotal: true },
      where: {
        status: OrderStatus.COMPLETED,
        event: { organizerUserId: organizerUserId },
      },
    }),

    // 2. Total Tickets Sold (count Tickets linked to completed orders)
    prisma.tickets.count({
      where: {
        order: {
          status: OrderStatus.COMPLETED,
          event: { organizerUserId: organizerUserId },
        },
      },
    }),

    // 3. Active Events Count
    prisma.events.count({
      where: {
        organizerUserId: organizerUserId,
        isDraft: false,
        endDate: { gte: today }, // endDate is today or later
      },
    }),

    // 4. Daily Ticket Sales (Group Tickets by creation date)
    prisma.tickets.groupBy({
      by: ['createdAt'], // Group by the full timestamp
      where: {
        order: {
          status: OrderStatus.COMPLETED,
          event: { organizerUserId: organizerUserId },
        },
        createdAt: { gte: thirtyDaysAgo }, // Only tickets in the last 30 days
      },
      _count: {
        id: true, // Count tickets in each group
      },
      orderBy: {
        createdAt: 'asc', // Order chronologically
      },
    }),

    // 5. Active Events List (Fetch limited fields + needed relations/counts)
    prisma.events.findMany({
      where: {
        organizerUserId: organizerUserId,
        isDraft: false,
        endDate: { gte: today },
      },
      select: {
        // Select only needed fields
        id: true,
        name: true,
        startDate: true,
        ticketTypes: { select: { quantity: true } }, // For capacity calculation
        _count: {
          // Count tickets linked to completed orders for THIS event
          select: {
            tickets: { where: { order: { status: OrderStatus.COMPLETED } } },
          },
        },
      },
      take: 5, // Limit results for the dashboard preview
      orderBy: { startDate: 'asc' }, // Show upcoming active events first
    }),

    prisma.orders.findMany({
      where: {
        event: { organizerUserId: organizerUserId },
        status: OrderStatus.COMPLETED,
      },
      select: {
        id: true,
        // Select name or firstName/lastName based on your preference/data
        // Assuming 'name' might be populated on order, otherwise join Users
        name: true,
        email: true, // Good fallback if name is null
        total: true,
        createdAt: true,
        status: true,
        // Optionally include number of tickets in the order
        // _count: { select: { tickets: true } }
      },
      orderBy: { createdAt: 'desc' }, // Get the most recent first
      take: 11, // Limit to 5 for the dashboard preview
    }),
  ]);

  // --- Process Results ---

  const totalRevenue = revenueResult._sum.subtotal ?? 0;
  const totalTicketsSold = ticketsSoldResult; // Direct count from prisma.tickets.count
  const activeEventsCount = activeEventsCountResult;

  // Process Daily Sales Data
  const salesMap = new Map<string, number>();
  // Initialize map for the date range to ensure days with 0 sales are included
  for (let i = 0; i < 30; i++) {
    const date = new Date(thirtyDaysAgo);
    date.setDate(thirtyDaysAgo.getDate() + i + 1); // +1 because we start from 30 days ago
    salesMap.set(date.toISOString().split('T')[0], 0);
  }
  // Populate map with fetched counts
  dailySalesGrouped.forEach((group) => {
    // Extract DATE part from the timestamp for reliable grouping
    const dateStr = group.createdAt.toISOString().split('T')[0];
    if (salesMap.has(dateStr)) {
      // Only include if within our 30 day map
      salesMap.set(dateStr, group._count.id);
    }
  });
  const dailySalesChartData = Array.from(salesMap.entries())
    .map(([date, tickets]) => ({ date, tickets }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Ensure sorted

  // Process Active Events List
  const activeEventsForTable = activeEventsRaw.map((event) => {
    const capacity = event.ticketTypes.reduce(
      (sum, tt) => sum + tt.quantity,
      0
    );
    const sold = event._count.tickets; // Use the pre-calculated count
    return {
      id: event.id,
      name: event.name,
      date: event.startDate.toISOString().split('T')[0],
      ticketsSold: sold,
      capacity: capacity,
      status: 'Active', // Derived from the query filter
    };
  });

  // Process Recent Orders
  const recentOrdersForTable = recentOrdersRaw.map((order) => ({
    id: order.id, // Use the actual order ID if it's more user-friendly, or format it
    customerDisplay: order.name || order.email || 'N/A', // Show name or email
    amount: order.total,
    date: order.createdAt?.toISOString().split('T')[0] || 'N/A', // Format date
    status: order.status,
    // items: order._count?.tickets // Include if you fetched the count
  }));

  // --- Return Processed Data ---
  return {
    totalRevenue,
    totalTicketsSold,
    activeEventsCount,
    dailySalesChartData, // This now ONLY contains { date, tickets }
    activeEventsForTable,
    recentOrdersForTable,
  };
};
