'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ColumnDef,
  Table as ReactTable,
  RowData,
  FilterFn,
} from '@tanstack/react-table';

import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  MobileCardInfoRowLarge,
  MobileCardInfoRow,
} from '@/components/ui/mobile-card-info';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PlusCircleIcon,
  Ticket,
  DollarSign,
  Users,
  Calendar,
  ExternalLink,
  Edit,
  Edit2,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface TicketType {
  id: string;
  name: string;
  price: number;
  quantity: number;
  quantitySold: number | null;
  saleStartsAt: Date;
  saleEndsAt: Date;
}

const priceFilterFn: FilterFn<TicketType> = (row, columnId, filterValue) => {
  const price = row.getValue<number>(columnId);
  if (filterValue === '0') {
    return price === 0;
  }
  if (filterValue === 'paid') {
    return price > 0;
  }
  return true;
};

const createColumns = (isMobile: boolean): ColumnDef<TicketType>[] => [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row, table }) => {
      const ticket = row.original;
      const eventId = table.options.meta?.eventId;
      if (!eventId) return <span>{ticket.name}</span>;
      return (
        <Link href={`/organizer/events/${eventId}/tickets/${ticket.id}`}>
          <span className="font-medium hover:underline cursor-pointer">
            {ticket.name}
          </span>
        </Link>
      );
    },
  },
  {
    accessorKey: 'price',
    header: 'Price',
    filterFn: priceFilterFn,
    cell: ({ row }) => {
      const price = parseFloat(row.getValue('price'));
      const formatted =
        price === 0
          ? 'Free'
          : new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(price);
      return <div>{formatted}</div>;
    },
  },
  {
    id: 'sold',
    header: 'Sold / Available',
    cell: ({ row }) => {
      const ticket = row.original;
      const sold = ticket.quantitySold ?? 0;
      const available = ticket.quantity;
      return <div>{`${sold} / ${available}`}</div>;
    },
  },
  {
    accessorKey: 'saleStartsAt',
    header: 'Sale Starts',
    cell: ({ row }) => {
      const date = row.getValue('saleStartsAt') as Date;
      return <div>{date.toLocaleDateString()}</div>;
    },
    meta: {
      hideOnMobile: true,
    },
  },
  {
    accessorKey: 'saleEndsAt',
    header: 'Sale Ends',
    cell: ({ row }) => {
      const date = row.getValue('saleEndsAt') as Date;
      return <div>{date.toLocaleDateString()}</div>;
    },
    meta: {
      hideOnMobile: true,
    },
  },
  {
    id: 'status',
    header: 'Status',
    accessorFn: (row) => {
      const now = new Date();
      const startsAt = row.saleStartsAt;
      const endsAt = row.saleEndsAt;
      if (now < startsAt) return 'Upcoming';
      if (now > endsAt) return 'Ended';
      return 'On Sale';
    },
    filterFn: 'equalsString',
    meta: {
      hideOnMobile: true,
    },
  },
];

declare module '@tanstack/table-core' {
  interface TableMeta<TData extends RowData> {
    eventId?: string;
  }
}

interface TicketTableWrapperProps {
  eventId: string;
  initialTicketTypes: TicketType[];
}

// Mobile Card View Component
function MobileCardView({
  searchTerm,
  setSearchTerm,
  filteredTickets,
  handleAddTicket,
  getTicketStatus,
  router,
  eventId,
}: {
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  filteredTickets: TicketType[];
  handleAddTicket: () => void;
  getTicketStatus: (ticket: TicketType) => string;
  router: ReturnType<typeof useRouter>;
  eventId: string;
}) {
  if (filteredTickets.length === 0) {
    return (
      <div className="px-4 md:px-0">
        <div className="flex flex-col gap-4 mb-6">
          <Input
            placeholder="Search ticket types..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
          <Button onClick={handleAddTicket} className="w-full h-12">
            <PlusCircleIcon className="mr-2 h-5 w-5" />
            Add Ticket
          </Button>
        </div>
        <div className="text-center py-12">
          <p className="text-muted-foreground text-base">
            {searchTerm
              ? 'No ticket types match your search.'
              : 'No ticket types found for this event.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 mb-6">
        <Input
          placeholder="Search ticket types..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full"
        />
        <Button onClick={handleAddTicket} className="w-full h-12">
          <PlusCircleIcon className="mr-2 h-5 w-5" />
          Add Ticket
        </Button>
      </div>

      <div className="space-y-4">
        {filteredTickets.map((ticket) => {
          const status = getTicketStatus(ticket);
          const sold = ticket.quantitySold ?? 0;
          const available = ticket.quantity;
          const price =
            ticket.price === 0
              ? 'Free'
              : new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(ticket.price);

          return (
            <Card key={ticket.id} className="w-full overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3 min-w-0">
                    <MobileCardInfoRowLarge
                      icon={Ticket}
                      content={ticket.name}
                    />

                    <MobileCardInfoRowLarge
                      icon={DollarSign}
                      iconColor="text-green-600"
                      content={price}
                      className="font-semibold text-base text-green-600"
                    />

                    <MobileCardInfoRow
                      icon={Users}
                      content={`${sold} / ${available} sold`}
                    />

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          status === 'On Sale'
                            ? 'default'
                            : status === 'Upcoming'
                              ? 'secondary'
                              : 'outline'
                        }
                        className="text-sm px-3 py-1"
                      >
                        {status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground px-3 py-1 bg-muted rounded-md inline-block max-w-fit">
                      <span className="truncate">
                        {ticket.saleStartsAt.toLocaleDateString()} -{' '}
                        {ticket.saleEndsAt.toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0"
                    onClick={() =>
                      router.push(
                        `/organizer/events/${eventId}/tickets/${ticket.id}`
                      )
                    }
                  >
                    <Edit2 className="h-5 w-5" />
                    <span className="sr-only">Edit Ticket</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function TicketTableWrapper({
  eventId,
  initialTicketTypes,
}: TicketTableWrapperProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState('');

  const mobileColumns = React.useMemo(
    () => createColumns(isMobile),
    [isMobile]
  );

  // Filter tickets based on search term
  const filteredTickets = useMemo(() => {
    if (!searchTerm) return initialTicketTypes;

    return initialTicketTypes.filter((ticket) => {
      const name = ticket.name.toLowerCase();
      const search = searchTerm.toLowerCase();
      return name.includes(search);
    });
  }, [initialTicketTypes, searchTerm]);

  const handleAddTicket = () => {
    router.push(`/organizer/events/${eventId}/tickets/new`);
  };

  const renderToolbar = (table: ReactTable<TicketType>) => (
    <div
      className={`flex items-center gap-2 ${isMobile ? 'flex-col' : 'justify-end flex-wrap'} gap-y-2`}
    >
      {!isMobile && (
        <div className="hidden sm:flex sm:items-center sm:gap-2">
          <Select
            value={
              (table.getColumn('price')?.getFilterValue() as string) ?? 'all'
            }
            onValueChange={(value) => {
              if (value === 'all') {
                table.getColumn('price')?.setFilterValue(undefined);
              } else {
                table.getColumn('price')?.setFilterValue(value);
              }
            }}
          >
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue placeholder="Price" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Prices</SelectItem>
              <SelectItem value="0">Free</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={
              (table.getColumn('status')?.getFilterValue() as string) ?? 'all'
            }
            onValueChange={(value) =>
              table
                .getColumn('status')
                ?.setFilterValue(value === 'all' ? undefined : value)
            }
          >
            <SelectTrigger className="h-8 w-[120px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="On Sale">On Sale</SelectItem>
              <SelectItem value="Upcoming">Upcoming</SelectItem>
              <SelectItem value="Ended">Ended</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <Button
        size={isMobile ? 'default' : 'sm'}
        className={isMobile ? 'h-10 w-full' : 'h-8'}
        onClick={handleAddTicket}
      >
        <PlusCircleIcon className="mr-2 h-4 w-4" />
        Add Ticket
      </Button>
    </div>
  );

  // Get ticket status
  const getTicketStatus = (ticket: TicketType) => {
    const now = new Date();
    if (now < ticket.saleStartsAt) return 'Upcoming';
    if (now > ticket.saleEndsAt) return 'Ended';
    return 'On Sale';
  };

  if (isMobile) {
    return (
      <MobileCardView
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filteredTickets={filteredTickets}
        handleAddTicket={handleAddTicket}
        getTicketStatus={getTicketStatus}
        router={router}
        eventId={eventId}
      />
    );
  }

  return (
    <DataTable
      columns={mobileColumns}
      data={initialTicketTypes}
      filterColumnId="name"
      filterInputPlaceholder="Search ticket names..."
      renderToolbarActions={renderToolbar}
      meta={{ eventId }}
      enableColumnVisibility={true}
      enablePagination={true}
    />
  );
}
