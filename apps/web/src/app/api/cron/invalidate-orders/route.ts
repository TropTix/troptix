import { NextRequest, NextResponse } from 'next/server';
import { OrderStatus } from '@troptix/db';
import prisma from '@/server/prisma';

const ORDER_EXPIRATION_LIMIT = 5;

async function invalidateExpiredOrders(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const cutoffTime = new Date(Date.now() - ORDER_EXPIRATION_LIMIT * 60000);
    const { count } = await prisma.orders.updateMany({
      where: { status: OrderStatus.PENDING, createdAt: { lt: cutoffTime } },
      data: { status: OrderStatus.CANCELLED },
    });
    return NextResponse.json({ success: true, invalidatedCount: count });
  } catch (error) {
    console.error('Failed to invalidate orders:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to invalidate expired orders' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return invalidateExpiredOrders(req);
}
export async function POST(req: NextRequest) {
  return invalidateExpiredOrders(req);
}
