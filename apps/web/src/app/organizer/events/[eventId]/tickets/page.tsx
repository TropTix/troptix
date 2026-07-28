import { notFound } from 'next/navigation';
import { DollarSign, Ticket } from 'lucide-react';
import {
  findOrganizationForOwner,
  listTicketTypes,
  NotFoundError,
} from '@troptix/api/server';
import type { TicketTypesView } from '@troptix/api';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { requireOrganizerActor } from '@/server/actor';
import prisma from '@/server/prisma';
import { formatCents } from '@/lib/dateUtils';
import { TicketTypesManager } from './_components/TicketTypesManager';

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

  // Writes are always self-scoped (never View-as), so the paid gate reads the
  // acting user's own org — the same flag the write service enforces. Kicked
  // off alongside the view fetch; independent reads, one wave.
  // .catch → null so a notFound() bail from the view fetch below can't leave
  // this floating as an unhandled rejection; the write service stays the
  // authoritative gate either way.
  const orgPromise =
    actor.kind === 'user'
      ? findOrganizationForOwner(prisma, actor.userId).catch(() => null)
      : Promise.resolve(null);

  let view: TicketTypesView;
  try {
    view = await listTicketTypes(prisma, actor, eventId, {
      viewAsOrganizerUserId: viewAs,
    });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const org = await orgPromise;
  const paidEventsEnabled = org?.paidTicketingEnabled ?? false;

  const { ticketTypes, summary } = view;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ticket types</h1>
        {ticketTypes.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {summary.onSale} of {ticketTypes.length} on sale
          </p>
        )}
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

      <TicketTypesManager
        ticketTypes={ticketTypes}
        eventId={eventId}
        eventEndsAt={new Date(view.eventEndsAt)}
        paidEventsEnabled={paidEventsEnabled}
      />
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
