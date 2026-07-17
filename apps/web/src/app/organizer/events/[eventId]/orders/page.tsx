import { notFound } from 'next/navigation';
import { listEventOrders, NotFoundError } from '@troptix/api/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireOrganizerActor } from '@/server/actor';
import prisma from '@/server/prisma';
import { OrdersTable } from './_components/OrdersTable';

export default async function EventOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ viewAs?: string }>;
}) {
  const actor = await requireOrganizerActor();
  const { eventId } = await params;
  const { viewAs } = await searchParams;

  let orders;
  try {
    orders = await listEventOrders(prisma, actor, eventId, {
      viewAsOrganizerUserId: viewAs,
    });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Orders</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {orders.length.toLocaleString()}{' '}
            {orders.length === 1 ? 'order' : 'orders'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No orders yet.
            </p>
          ) : (
            <OrdersTable orders={orders} eventId={eventId} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
