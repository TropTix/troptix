import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DollarSign, Plus, Ticket } from 'lucide-react';
import { listTicketTypes, NotFoundError } from '@troptix/api/server';
import type { SaleState, TicketTypeRow, TicketTypesView } from '@troptix/api';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { requireOrganizerActor } from '@/server/actor';
import prisma from '@/server/prisma';
import { formatCents } from '@/lib/dateUtils';

const SALE_STATE: Record<
  SaleState,
  { label: string; variant: 'default' | 'outline' | 'secondary' }
> = {
  OnSale: { label: 'On sale', variant: 'default' },
  Scheduled: { label: 'Scheduled', variant: 'outline' },
  Ended: { label: 'Ended', variant: 'secondary' },
};

export default async function EventTicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ viewAs?: string }>;
}) {
  const actor = await requireOrganizerActor();
  const { eventId } = await params;
  const { viewAs } = await searchParams;

  let view: TicketTypesView;
  try {
    view = await listTicketTypes(prisma, actor, eventId, {
      viewAsOrganizerUserId: viewAs,
    });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { ticketTypes, summary } = view;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ticket types</h1>
          {ticketTypes.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {summary.onSale} of {ticketTypes.length} on sale
            </p>
          )}
        </div>
        {/* Adding a ticketType is first-class here — including after go-live. */}
        <Button asChild>
          <Link href={`/organizer/events/${eventId}/tickets/new`}>
            <Plus className="mr-2 h-4 w-4" />
            Add ticket type
          </Link>
        </Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <SummaryCard
          label="Tickets sold"
          value={summary.sold.toLocaleString()}
          hint={`of ${summary.capacity.toLocaleString()} capacity`}
          icon={<Ticket className="h-5 w-5 text-muted-foreground" />}
        />
        <SummaryCard
          label="Ticket revenue"
          value={formatCents(summary.revenueCents)}
          hint="before fees & refunds"
          icon={<DollarSign className="h-5 w-5 text-muted-foreground" />}
        />
      </section>

      {ticketTypes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div>
              <p className="font-medium">No ticket types yet</p>
              <p className="text-sm text-muted-foreground">
                Add a ticketType to start selling.
              </p>
            </div>
            <Button asChild size="sm">
              <Link href={`/organizer/events/${eventId}/tickets/new`}>
                Add your first ticket type
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {ticketTypes.map((ticketType) => (
            <li key={ticketType.id}>
              <TicketTypeCard ticketType={ticketType} eventId={eventId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl">{value}</CardTitle>
        </div>
        <span className="shrink-0">{icon}</span>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function TicketTypeCard({
  ticketType,
  eventId,
}: {
  ticketType: TicketTypeRow;
  eventId: string;
}) {
  const soldPercent =
    ticketType.capacity > 0 ? (ticketType.sold / ticketType.capacity) * 100 : 0;
  const state = SALE_STATE[ticketType.saleState];

  return (
    <Link
      href={`/organizer/events/${eventId}/tickets/${ticketType.id}`}
      className="block rounded-lg border p-4 transition-colors hover:border-primary/50"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium" title={ticketType.name}>
              {ticketType.name}
            </span>
            <Badge variant={state.variant} className="shrink-0">
              {state.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatCents(ticketType.priceCents)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-medium">{formatCents(ticketType.revenueCents)}</p>
          <p className="text-xs text-muted-foreground">revenue</p>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <Progress value={soldPercent} className="h-1.5" />
        <p className="text-xs text-muted-foreground">
          {ticketType.sold.toLocaleString()} /{' '}
          {ticketType.capacity.toLocaleString()} sold
        </p>
      </div>
    </Link>
  );
}
