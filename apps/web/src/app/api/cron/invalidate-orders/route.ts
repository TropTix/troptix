import { NextResponse } from 'next/server';
import { OrderStatus } from '@/generated/prisma/client';
import prisma from '@/server/prisma';

const ORDER_EXPIRATION_LIMIT = 5;

export async function POST() {
  try {
    const cutoffTime = new Date(Date.now() - ORDER_EXPIRATION_LIMIT * 60000);

    const { count } = await prisma.orders.updateMany({
      where: {
        status: OrderStatus.PENDING,
        createdAt: { lt: cutoffTime },
      },
      data: {
        status: OrderStatus.CANCELLED,
      },
    });

    return NextResponse.json({
      success: true,
      message: `${count} expired orders invalidated`,
      invalidatedCount: count,
    });
  } catch (error) {
    console.error('Failed to invalidate orders:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to invalidate expired orders',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
