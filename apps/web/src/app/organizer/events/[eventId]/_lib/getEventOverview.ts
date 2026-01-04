import { OrderStatus } from '@prisma/client';
import { notFound } from 'next/navigation';
import prisma from '@/server/prisma';
import { verifyEventAccess, getEventWhereClause } from '@/server/accessControl';

// Core Event Information
interface EventInfo {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'live' | 'ended';
  createdAt: Date;
  updatedAt: Date;
  startDate: Date;
  startTime: Date | null;
  endDate: Date | null;
  endTime: Date | null;
  venue: string | null;
  address: string | null;
}

// Financial Data
interface EventFinancials {
  totalRevenue: number;
  netRevenue: number;
  averageOrderValue: number;
  totalOrders: number;
}

// Ticket Data
interface EventTickets {
  totalSold: number;
  totalCapacity: number;
  capacityUsed: number; // percentage
  topSellingType: {
    name: string;
    sold: number;
    revenue: number;
  } | null;
  ticketTypes: Array<{
    name: string;
    sold: number;
    capacity: number;
    revenue: number;
  }>;
}

// Time-based Data
interface EventTiming {
  daysUntilEvent: number | 'live' | 'ended';
  eventPhase: 'upcoming' | 'live' | 'ended';
  salesVelocity: number; // tickets per day
}

// Recent Activity
interface RecentActivity {
  recentOrders: Array<{
    id: string;
    customerName: string;
    amount: number;
    ticketCount: number;
    date: string;
  }>;
  dailyRevenue: Array<{
    date: string;
    revenue: number;
  }>;
  chartDaysShown: number;
  chartDescription: string;
}

// Main Overview Type
export interface EventOverview {
  event: EventInfo;
  financials: EventFinancials;
  tickets: EventTickets;
  timing: EventTiming;
  activity: RecentActivity;
}

// Helper function to determine event status
function getEventStatus(
  isDraft: boolean,
  startDate: Date,
  endDate: Date | null
): EventInfo['status'] {
  if (isDraft) return 'draft';

  const now = new Date();
  const eventStart = new Date(startDate);
  const eventEnd = endDate ? new Date(endDate) : null;

  if (now < eventStart) return 'published';
  if (eventEnd && now > eventEnd) return 'ended';
  return 'live';
}

// Helper function to calculate days until event
function getDaysUntilEvent(
  startDate: Date,
  endDate: Date | null
): EventTiming['daysUntilEvent'] {
  const now = new Date();
  const eventStart = new Date(startDate);
  const eventEnd = endDate ? new Date(endDate) : null;

  if (eventEnd && now > eventEnd) return 'ended';
  if (now >= eventStart && (!eventEnd || now <= eventEnd)) return 'live';

  const diffTime = eventStart.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export async function getEventOverview(
  eventId: string,
  userId: string,
  userEmail?: string
): Promise<EventOverview> {
  // Verify user has access to this event (throws notFound if unauthorized)
  await verifyEventAccess(userId, userEmail, eventId);

  // Get the event creation date to determine appropriate date range
  const eventCreationData = await prisma.events.findUnique({
    where: { id: eventId },
    select: { createdAt: true },
  });

  if (!eventCreationData) {
    notFound();
  }

  // Calculate dynamic date range: last 30 days OR since event creation (whichever is shorter)
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const eventCreatedDate = new Date(eventCreationData.createdAt);
  eventCreatedDate.setHours(0, 0, 0, 0);

  // Use the later date (more recent) as our start date
  const chartStartDate =
    eventCreatedDate > thirtyDaysAgo ? eventCreatedDate : thirtyDaysAgo;

  // Calculate how many days we're actually showing
  const daysDifference = Math.ceil(
    (now.getTime() - chartStartDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const chartDaysShown = Math.max(1, daysDifference); // Ensure at least 1 day

  // Single comprehensive query with proper joins
  const eventData = await prisma.events.findUnique({
    where: getEventWhereClause(userId, userEmail, eventId),
    include: {
      ticketTypes: {
        select: {
          name: true,
          quantity: true,
          quantitySold: true,
          price: true,
        },
      },
      orders: {
        where: { status: OrderStatus.COMPLETED },
        select: {
          id: true,
          subtotal: true,
          name: true,
          email: true,
          createdAt: true,
          _count: {
            select: { tickets: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!eventData) {
    notFound();
  }

  // Get daily revenue data for the calculated date range
  const dailyRevenue = await prisma.orders.groupBy({
    by: ['createdAt'],
    where: {
      eventId: eventId,
      status: OrderStatus.COMPLETED,
      createdAt: { gte: chartStartDate },
    },
    _sum: { subtotal: true },
    orderBy: { createdAt: 'asc' },
  });

  // Process event info
  const eventInfo: EventInfo = {
    id: eventData.id,
    name: eventData.name,
    status: getEventStatus(
      eventData.isDraft,
      eventData.startDate,
      eventData.endDate
    ),
    createdAt: eventData.createdAt,
    updatedAt: eventData.updatedAt,
    startDate: eventData.startDate,
    startTime: eventData.startTime,
    endDate: eventData.endDate,
    endTime: eventData.endTime,
    venue: eventData.venue,
    address: eventData.address,
  };

  // Process financial data
  const totalRevenue = eventData.orders.reduce(
    (sum, order) => sum + (order.subtotal ?? 0),
    0
  );
  const totalOrders = eventData.orders.length;

  const financials: EventFinancials = {
    totalRevenue,
    netRevenue: totalRevenue * 0.97, // Assuming 3% platform fee
    averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    totalOrders,
  };

  // Process ticket data
  const totalSold = eventData.orders.reduce(
    (sum, order) => sum + order._count.tickets,
    0
  );
  const totalCapacity = eventData.ticketTypes.reduce(
    (sum, tt) => sum + (tt.quantity || 0),
    0
  );

  const ticketTypesWithRevenue = eventData.ticketTypes.map((tt) => ({
    name: tt.name,
    sold: tt.quantitySold || 0,
    capacity: tt.quantity || 0,
    revenue: (tt.quantitySold || 0) * tt.price,
  }));

  const topSellingType =
    ticketTypesWithRevenue
      .filter((tt) => tt.sold > 0)
      .sort((a, b) => b.sold - a.sold)[0] || null;

  const tickets: EventTickets = {
    totalSold,
    totalCapacity,
    capacityUsed: totalCapacity > 0 ? (totalSold / totalCapacity) * 100 : 0,
    topSellingType,
    ticketTypes: ticketTypesWithRevenue,
  };

  // Process timing data
  const daysUntilEvent = getDaysUntilEvent(
    eventData.startDate,
    eventData.endDate
  );
  const eventPhase: EventTiming['eventPhase'] =
    daysUntilEvent === 'ended'
      ? 'ended'
      : daysUntilEvent === 'live'
        ? 'live'
        : 'upcoming';

  // Calculate sales velocity (tickets sold per day since creation)
  const daysSinceCreated = Math.max(
    1,
    Math.floor(
      (Date.now() - eventData.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    )
  );
  const salesVelocity = totalSold / daysSinceCreated;

  const timing: EventTiming = {
    daysUntilEvent,
    eventPhase,
    salesVelocity,
  };

  // Process recent activity
  const recentOrders = eventData.orders.slice(0, 5).map((order) => ({
    id: `#${order.id.substring(0, 6)}`,
    customerName: order.name || order.email || 'Guest',
    amount: order.subtotal ?? 0,
    ticketCount: order._count.tickets,
    date: order.createdAt?.toLocaleDateString() || '',
  }));

  // Process daily revenue for chart (fill gaps with zeros for the dynamic range)
  const revenueMap = new Map<string, number>();
  for (let i = 0; i < chartDaysShown; i++) {
    const date = new Date(chartStartDate);
    date.setDate(chartStartDate.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    revenueMap.set(dateStr, 0);
  }

  dailyRevenue.forEach((group) => {
    if (group.createdAt) {
      const dateStr = group.createdAt.toISOString().split('T')[0];
      if (revenueMap.has(dateStr)) {
        revenueMap.set(
          dateStr,
          (revenueMap.get(dateStr) || 0) + (group._sum.subtotal ?? 0)
        );
      }
    }
  });

  const dailyRevenueData = Array.from(revenueMap.entries())
    .map(([date, revenue]) => ({ date, revenue }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Generate appropriate chart description
  const chartDescription =
    chartDaysShown === 1
      ? 'Showing revenue for today'
      : chartDaysShown <= 7
        ? `Showing revenue for the last ${chartDaysShown} days`
        : chartDaysShown < 30
          ? `Showing revenue since event creation (${chartDaysShown} days)`
          : 'Showing revenue for the last 30 days';

  const activity: RecentActivity = {
    recentOrders,
    dailyRevenue: dailyRevenueData,
    chartDaysShown,
    chartDescription,
  };

  return {
    event: eventInfo,
    financials,
    tickets,
    timing,
    activity,
  };
}
