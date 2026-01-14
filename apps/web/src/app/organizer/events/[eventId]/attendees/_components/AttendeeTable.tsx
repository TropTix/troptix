'use client';
import React, { useTransition, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { FetchedTicketData } from '../page';
import { DataTable } from '@/components/ui/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  MobileCardInfoRowLarge,
  MobileCardInfoRow,
} from '@/components/ui/mobile-card-info';
import { Loader2, User, Mail, Ticket, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { toggleTicketStatus } from '../_actions/attendeeActions';
import { useIsMobile } from '@/hooks/use-mobile';

interface AttendeeTableProps {
  attendees: FetchedTicketData[];
}

const CheckInButton = ({
  ticketId,
  currentStatus,
  eventId,
}: {
  ticketId: string;
  currentStatus: string;
  eventId: string;
}) => {
  const [isPending, startTransition] = useTransition();

  const handleToggleStatus = async () => {
    startTransition(async () => {
      try {
        const result = await toggleTicketStatus(ticketId, eventId);

        if (result.success) {
          toast.success(
            currentStatus === 'AVAILABLE'
              ? 'Attendee checked in successfully!'
              : 'Attendee checked out successfully!'
          );
        } else {
          toast.error(result.error || 'Failed to update check-in status');
        }
      } catch (error) {
        console.error('Error toggling ticket status:', error);
        toast.error('Failed to update check-in status');
      }
    });
  };

  return (
    <Button
      variant={currentStatus === 'AVAILABLE' ? 'default' : 'outline'}
      size="sm"
      onClick={handleToggleStatus}
      disabled={isPending}
      className="w-9 p-0 md:w-auto md:px-3"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
      ) : (
        <>
          {/* Mobile view: Icon only */}
          <span className="md:hidden">
            {currentStatus === 'AVAILABLE' ? (
              <Check className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </span>
          {/* Desktop view: Text only */}
          <span className="hidden md:block whitespace-nowrap">
            {currentStatus === 'AVAILABLE' ? 'Check In' : 'Check Out'}
          </span>
        </>
      )}
    </Button>
  );
};

// Separate mobile view component to prevent re-renders
const MobileAttendeeView = ({
  attendees,
  eventId,
}: {
  attendees: FetchedTicketData[];
  eventId: string;
}) => {
  return (
    <div>
      {attendees.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            No attendees match your search.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {attendees.map((attendee) => {
            const name =
              [attendee.firstName, attendee.lastName]
                .filter(Boolean)
                .join(' ') || 'N/A';
            const status = attendee.status;

            return (
              <Card key={attendee.id} className="w-full overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3 min-w-0">
                      <MobileCardInfoRowLarge icon={User} content={name} />

                      {attendee.email && (
                        <MobileCardInfoRow
                          icon={Mail}
                          content={attendee.email}
                        />
                      )}

                      <MobileCardInfoRow
                        icon={Ticket}
                        content={attendee.ticketType?.name || 'N/A'}
                      />

                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            status === 'NOT_AVAILABLE' ? 'default' : 'secondary'
                          }
                          className="text-sm px-3 py-1"
                        >
                          {status === 'NOT_AVAILABLE'
                            ? 'Checked In'
                            : 'Available'}
                        </Badge>
                      </div>
                    </div>

                    <CheckInButton
                      ticketId={attendee.id}
                      currentStatus={attendee.status}
                      eventId={eventId}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AttendeeTable = ({ attendees }: AttendeeTableProps) => {
  const params = useParams();
  const eventId = params?.eventId as string;
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState('');

  const columns: ColumnDef<FetchedTicketData>[] = [
    {
      id: 'name',
      accessorFn: (row) =>
        [row.firstName, row.lastName].filter(Boolean).join(' ') || 'N/A',
      header: 'Attendee Name',
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => row.original.email || 'N/A',
    },
    {
      accessorKey: 'ticketType.name',
      header: 'Ticket Type',
      cell: ({ row }) => row.original.ticketType?.name || 'N/A',
      meta: {
        hideOnMobile: true,
      },
    },
    {
      accessorKey: 'order.id',
      header: 'Order ID',
      cell: ({ row }) => row.original.order?.id || 'N/A',
      meta: {
        hideOnMobile: true,
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <Badge
            variant={status === 'NOT_AVAILABLE' ? 'default' : 'secondary'}
            className="whitespace-nowrap"
          >
            {status === 'NOT_AVAILABLE' ? 'Checked In' : 'Available'}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'checkIn',
      header: 'Action',
      cell: ({ row }) => {
        const ticketId = row.original.id;
        const currentStatus = row.original.status;

        return (
          <CheckInButton
            ticketId={ticketId}
            currentStatus={currentStatus}
            eventId={eventId}
          />
        );
      },
    },
  ];

  // Filter attendees based on search term
  const filteredAttendees = useMemo(() => {
    if (!searchTerm) return attendees;

    return attendees.filter((attendee) => {
      const name = [attendee.firstName, attendee.lastName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const email = (attendee.email || '').toLowerCase();
      const ticketType = (attendee.ticketType?.name || '').toLowerCase();
      const orderId = (attendee.order?.id || '').toLowerCase();

      const search = searchTerm.toLowerCase();
      return (
        name.includes(search) ||
        email.includes(search) ||
        ticketType.includes(search) ||
        orderId.includes(search)
      );
    });
  }, [attendees, searchTerm]);

  if (!attendees || attendees.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">
          No attendees found for this event.
        </p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div>
        <div className="mb-6">
          <Input
            placeholder="Search attendees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
        <MobileAttendeeView attendees={filteredAttendees} eventId={eventId} />
      </div>
    );
  }

  return (
    <div className="mx-auto">
      <DataTable
        columns={columns}
        data={filteredAttendees}
        filterColumnId="name"
        filterInputPlaceholder="Search attendees..."
        enableColumnVisibility={true}
      />
    </div>
  );
};

export default AttendeeTable;
