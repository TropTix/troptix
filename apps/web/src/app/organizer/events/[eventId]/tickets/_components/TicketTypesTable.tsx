'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { SaleState, TicketTypeRow } from '@troptix/api';

import { Badge } from '@/components/ui/badge';
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

const SALE_STATE: Record<
  SaleState,
  { label: string; variant: 'default' | 'outline' | 'secondary' }
> = {
  OnSale: { label: 'On Sale', variant: 'default' },
  Scheduled: { label: 'Scheduled', variant: 'outline' },
  Ended: { label: 'Ended', variant: 'secondary' },
};

/** Free reads as FREE rather than $0.00 — it's a different kind of ticket. */
function price(cents: number) {
  return cents === 0 ? 'FREE' : formatCents(cents);
}

function saleDate(iso: string) {
  return getDateFormatter(new Date(iso), 'MMM d, yyyy');
}

export function TicketTypesTable({
  ticketTypes,
  eventId,
}: {
  ticketTypes: TicketTypeRow[];
  eventId: string;
}) {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === ''
      ? ticketTypes
      : ticketTypes.filter((t) => t.name.toLowerCase().includes(q));
  }, [ticketTypes, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticket types"
            className="pl-8"
            aria-label="Search ticket types by name"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No ticket types match.
        </p>
      ) : (
        <>
          {/* Mobile: a tappable card per type (tables reshape to cards on
              mobile, never horizontal-scroll spreadsheets — UX plan). */}
          <ul className="space-y-3 md:hidden">
            {visible.map((ticketType) => (
              <li key={ticketType.id}>
                <Link
                  href={`/organizer/events/${eventId}/tickets/${ticketType.id}`}
                  className="block rounded-lg border p-4 active:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span
                        className="block truncate font-medium"
                        title={ticketType.name}
                      >
                        {ticketType.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {price(ticketType.displayPriceCents)}
                      </span>
                    </div>
                    <SaleStateBadge state={ticketType.saleState} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      {saleDate(ticketType.saleStartsAt)}
                      {' – '}
                      {saleDate(ticketType.saleEndsAt)}
                    </span>
                    <span className="font-medium text-foreground">
                      {ticketType.sold.toLocaleString()} /{' '}
                      {ticketType.capacity.toLocaleString()}
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
                  <TableHead>Ticket Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Gross Price</TableHead>
                  <TableHead className="text-right">Display Price</TableHead>
                  <TableHead>Sold</TableHead>
                  <TableHead>Start Sale</TableHead>
                  <TableHead>End Sale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((ticketType) => (
                  <TableRow key={ticketType.id} className="cursor-pointer">
                    <TableCell className="p-0">
                      <Link
                        href={`/organizer/events/${eventId}/tickets/${ticketType.id}`}
                        className="block truncate px-4 py-3 font-medium"
                        title={ticketType.name}
                      >
                        {ticketType.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <SaleStateBadge state={ticketType.saleState} />
                    </TableCell>
                    <TableCell className="text-right">
                      {price(ticketType.grossPriceCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      {price(ticketType.displayPriceCents)}
                    </TableCell>
                    <TableCell>
                      {ticketType.sold.toLocaleString()} /{' '}
                      {ticketType.capacity.toLocaleString()}
                    </TableCell>
                    <TableCell>{saleDate(ticketType.saleStartsAt)}</TableCell>
                    <TableCell>{saleDate(ticketType.saleEndsAt)}</TableCell>
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

function SaleStateBadge({ state }: { state: SaleState }) {
  const { label, variant } = SALE_STATE[state];
  return <Badge variant={variant}>{label}</Badge>;
}
