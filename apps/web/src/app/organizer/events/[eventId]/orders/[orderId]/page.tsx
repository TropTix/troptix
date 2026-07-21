import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getOrderDetail, NotFoundError } from '@troptix/api/server';
import type { OrderDetail } from '@troptix/api';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { requireOrganizerActor } from '@/server/actor';
import prisma from '@/server/prisma';
import { formatCents, getDateFormatter } from '@/lib/dateUtils';
import { formatOrderNumber } from '@/lib/utils';
import StatusBadge from '../_components/StatusBadge';

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; orderId: string }>;
  searchParams: Promise<{ viewAs?: string }>;
}) {
  const actor = await requireOrganizerActor();
  const { eventId, orderId } = await params;
  const { viewAs } = await searchParams;

  let order: OrderDetail;
  try {
    order = await getOrderDetail(prisma, actor, eventId, orderId, {
      viewAsOrganizerUserId: viewAs,
    });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Link
          href={`/organizer/events/${eventId}/orders`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          All orders
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-muted-foreground">
              {formatOrderNumber(order.id)}
            </p>
            <h1 className="text-2xl font-bold tracking-tight">
              {order.customer.name ?? order.customer.email ?? 'Order'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {order.createdAt
                ? getDateFormatter(new Date(order.createdAt), 'PPP p')
                : 'Date unknown'}
            </p>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tickets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.lineItems.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span>
                {item.quantity} × {item.name}
                <span className="text-muted-foreground">
                  {' '}
                  ({formatCents(item.unitPriceCents)})
                </span>
              </span>
              <span className="font-medium">
                {formatCents(item.subtotalCents)}
              </span>
            </div>
          ))}

          <Separator />

          <BreakdownRow label="Subtotal" cents={order.subtotalCents} />
          <BreakdownRow label="Fees" cents={order.feesCents} />
          <div className="flex items-center justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatCents(order.totalCents)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Customer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <InfoRow label="Name" value={order.customer.name} />
          <InfoRow label="Email" value={order.customer.email} />
          <InfoRow label="Phone" value={order.customer.phone} />
          <InfoRow label="Payment" value={order.paymentMethod} />
        </CardContent>
      </Card>
    </div>
  );
}

function BreakdownRow({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{label}</span>
      <span>{formatCents(cents)}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value ?? '—'}</span>
    </div>
  );
}
