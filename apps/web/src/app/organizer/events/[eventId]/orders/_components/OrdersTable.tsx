'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { EventOrderRow, OrderStatusDto } from '@troptix/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCents, getDateFormatter } from '@/lib/dateUtils';
import { formatOrderNumber } from '@/lib/utils';
import StatusBadge from './StatusBadge';

type Filter = 'All' | OrderStatusDto;
const FILTERS: Filter[] = ['All', 'COMPLETED', 'PENDING', 'CANCELLED'];
const FILTER_LABEL: Record<Filter, string> = {
  All: 'All',
  COMPLETED: 'Completed',
  PENDING: 'Pending',
  CANCELLED: 'Cancelled',
};

export function OrdersTable({
  orders,
  eventId,
}: {
  orders: EventOrderRow[];
  eventId: string;
}) {
  const [filter, setFilter] = useState<Filter>('All');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter(
      (order) =>
        (filter === 'All' || order.status === filter) &&
        (q === '' ||
          order.customerDisplay.toLowerCase().includes(q) ||
          formatOrderNumber(order.id).toLowerCase().includes(q))
    );
  }, [orders, filter, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABEL[f]}
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer or order #"
            className="pl-8"
            aria-label="Search orders"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No orders match.
        </p>
      ) : (
        <>
          {/* Mobile: a tappable card per order (tables reshape to cards on
              mobile, never horizontal-scroll spreadsheets — UX plan). */}
          <ul className="space-y-3 md:hidden">
            {visible.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/organizer/events/${eventId}/orders/${order.id}`}
                  className="block rounded-lg border p-4 active:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span
                        className="block truncate font-medium"
                        title={order.customerDisplay}
                      >
                        {order.customerDisplay}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatOrderNumber(order.id)}
                      </span>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      {order.createdAt
                        ? getDateFormatter(new Date(order.createdAt), 'MMM d')
                        : '—'}
                      {' · '}
                      {order.ticketCount.toLocaleString()}{' '}
                      {order.ticketCount === 1 ? 'ticket' : 'tickets'}
                    </span>
                    <span className="font-medium text-foreground">
                      {formatCents(order.amountChargedCents)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: the full table. */}
          <div className="hidden rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Tickets</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((order) => (
                  <TableRow key={order.id} className="cursor-pointer">
                    <TableCell className="p-0">
                      <Link
                        href={`/organizer/events/${eventId}/orders/${order.id}`}
                        className="block px-4 py-3 font-mono text-xs text-muted-foreground"
                      >
                        {formatOrderNumber(order.id)}
                      </Link>
                    </TableCell>
                    <TableCell className="truncate font-medium">
                      {order.customerDisplay}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCents(order.amountChargedCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      {order.ticketCount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {order.createdAt
                        ? getDateFormatter(
                            new Date(order.createdAt),
                            'MMM d, yyyy'
                          )
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
