'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Info, Pencil, Search } from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
      <div className="relative w-full sm:w-72">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ticket types"
          className="pl-8"
          aria-label="Search ticket types by name"
        />
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No ticket types match.
        </p>
      ) : (
        <>
          {/* Mobile: one card per type — never a horizontal-scroll table. */}
          <ul className="space-y-3 md:hidden">
            {visible.map((ticketType) => (
              <li key={ticketType.id}>
                <Link
                  href={`/organizer/events/${eventId}/tickets/${ticketType.id}`}
                  className="block rounded-lg border p-4 active:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="truncate font-medium">
                      {ticketType.name}
                    </span>
                    <Badge variant={SALE_STATE[ticketType.saleState].variant}>
                      {SALE_STATE[ticketType.saleState].label}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      {ticketType.sold.toLocaleString()} /{' '}
                      {ticketType.capacity.toLocaleString()} sold
                    </span>
                    <span className="font-medium text-foreground">
                      {price(ticketType.displayPriceCents)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {saleDate(ticketType.saleStartsAt)} –{' '}
                    {saleDate(ticketType.saleEndsAt)}
                  </p>
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
                  <TableHead>
                    <SoldHeader />
                  </TableHead>
                  <TableHead>Start Sale</TableHead>
                  <TableHead>End Sale</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((ticketType) => {
                  const state = SALE_STATE[ticketType.saleState];
                  return (
                    <TableRow key={ticketType.id}>
                      <TableCell className="font-medium">
                        {ticketType.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={state.variant}>{state.label}</Badge>
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
                      <TableCell>
                        <Link
                          href={`/organizer/events/${eventId}/tickets/${ticketType.id}`}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={`Edit ${ticketType.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

/** `sold` is the type's inventory counter, not a count of ticket rows. */
function SoldHeader() {
  return (
    <TooltipProvider>
      <Tooltip>
        <span className="inline-flex items-center gap-1">
          Sold
          <TooltipTrigger aria-label="What does Sold count?">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </TooltipTrigger>
        </span>
        <TooltipContent className="max-w-xs">
          Confirmed sales against this type&apos;s capacity. Counts inventory
          sold, which can differ from tickets issued if a type was deleted.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
