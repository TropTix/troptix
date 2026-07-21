'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { TicketTypeRow } from '@troptix/api';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AddTicketTypeDrawer } from '@/app/organizer/events/_components/AddTicketTypeDrawer';
import {
  ticketTypeSchema,
  type TicketTypeFormValues,
} from '@/lib/schemas/ticketSchema';
import { createTicketType, updateTicketType } from '../_actions/ticketActions';
import { TicketTypesTable } from './TicketTypesTable';

/**
 * Screen E's write surface: the same drawer the create-event form uses,
 * opened over the ticket-types table for add, edit, and duplicate — no page
 * hops. Duplicate is a create seeded from the source row: inventory counters
 * start at zero by construction, and the paid gate applies like any create.
 */
export function TicketTypesManager({
  ticketTypes,
  eventId,
  eventEndsAt,
  paidEventsEnabled,
}: {
  ticketTypes: TicketTypeRow[];
  eventId: string;
  /** Seeds the drawer's default sale-window end for new tickets. */
  eventEndsAt: Date;
  paidEventsEnabled: boolean;
}) {
  const [drawer, setDrawer] = useState<{
    data?: Partial<TicketTypeFormValues> & { id?: string };
  } | null>(null);

  const handleSubmit = async (data: TicketTypeFormValues & { id?: string }) => {
    const { id, ...values } = data;
    const result = id
      ? await updateTicketType(eventId, id, values)
      : await createTicketType(eventId, values);
    if (result.success) {
      // No router.refresh(): the action's revalidatePath already re-renders
      // this route and streams the fresh UI back in the same response.
      toast.success(id ? 'Ticket updated.' : 'Ticket added.');
    }
    return result;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setDrawer({})}>
          <Plus className="mr-2 h-4 w-4" />
          Add ticket type
        </Button>
      </div>

      {ticketTypes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div>
              <p className="font-medium">No ticket types yet</p>
              <p className="text-sm text-muted-foreground">
                Add a ticket type to start selling.
              </p>
            </div>
            <Button size="sm" onClick={() => setDrawer({})}>
              Add your first ticket type
            </Button>
          </CardContent>
        </Card>
      ) : (
        <TicketTypesTable
          ticketTypes={ticketTypes}
          onEdit={(row) => setDrawer({ data: toFormValues(row) })}
          onDuplicate={(row) =>
            setDrawer({
              data: {
                ...toFormValues(row),
                id: undefined,
                name: `${row.name} (copy)`,
                // Never inherited: a copy silently gated behind the source's
                // access code is unsellable with no visible reason.
                discountCode: undefined,
              },
            })
          }
        />
      )}

      <AddTicketTypeDrawer
        paidEventsEnabled={paidEventsEnabled}
        open={drawer !== null}
        setOpen={(open) => !open && setDrawer(null)}
        onSubmit={handleSubmit}
        initialData={drawer?.data}
        ticketSchema={ticketTypeSchema}
        defaultSaleEnd={eventEndsAt}
      />
    </div>
  );
}

function toFormValues(
  row: TicketTypeRow
): Partial<TicketTypeFormValues> & { id?: string } {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    price: row.grossPriceCents / 100,
    capacity: row.capacity,
    maxPurchasePerUser: row.maxPurchasePerUser,
    saleStartsAt: new Date(row.saleStartsAt),
    saleEndsAt: new Date(row.saleEndsAt),
    ticketingFees: row.ticketingFees,
    discountCode: row.discountCode ?? undefined,
  };
}
