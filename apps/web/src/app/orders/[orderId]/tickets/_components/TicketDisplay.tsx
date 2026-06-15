// components/ticket-display-manager.tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image'; // For the list view cards
import { eventFlyerUrl } from '@/lib/supabase/storage';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
// Carousel imports are removed
import {
  Card,
  CardTitle,
  CardDescription,
  CardHeader,
  CardContent,
} from '@/components/ui/card'; // For list items
import { AspectRatio } from '@/components/ui/aspect-ratio';
import {
  TicketIcon,
  CalendarDaysIcon,
  MapPinIcon,
  UserIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const formatDate = (
  date: Date | string | null,
  options?: Intl.DateTimeFormatOptions
) => {
  if (!date) return 'N/A';
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return new Date(date).toLocaleDateString(
    undefined,
    options || defaultOptions
  );
};
export type TicketInfo = {
  id: string;
  status: string;
  firstName: string;
  lastName: string;
  email: string;
  ticketType: {
    name: string;
  };
  event: {
    name: string;
    imageUrl: string;
    startDate: Date;
    venue: string;
    address: string;
  };
};

export default function TicketDisplayManager({
  tickets,
  ticketId,
}: {
  tickets: TicketInfo[];
  ticketId: string | undefined;
}) {
  const [activeTicketId, setActiveTicketId] = useState<string | null>(
    ticketId || null
  );

  const isDialogEffectivelyOpen = useMemo(() => {
    return !!activeTicketId && tickets.some((t) => t.id === activeTicketId);
  }, [activeTicketId, tickets]);

  const currentTicketIndex = useMemo(() => {
    if (!activeTicketId) return -1;
    return tickets.findIndex((t) => t.id === activeTicketId);
  }, [activeTicketId, tickets]);

  const currentTicketData = useMemo(() => {
    if (currentTicketIndex === -1 || !tickets[currentTicketIndex]) return null;
    return tickets[currentTicketIndex];
  }, [currentTicketIndex, tickets]);

  const handleOpenDialog = useCallback(
    (ticketId: string) => {
      setActiveTicketId(ticketId);
    },
    [setActiveTicketId]
  );

  const handleCloseDialog = useCallback(() => {
    setActiveTicketId(null);
  }, [setActiveTicketId]);
  const navigateToTicket = useCallback(
    (direction: 'next' | 'prev') => {
      if (currentTicketIndex === -1 || !tickets || tickets.length === 0) return;
      let nextTicketIndex;
      if (direction === 'next') {
        nextTicketIndex = currentTicketIndex + 1;
      } else {
        nextTicketIndex = currentTicketIndex - 1;
      }
      if (nextTicketIndex >= 0 && nextTicketIndex < tickets.length) {
        const nextTicketId = tickets[nextTicketIndex].id;
        setActiveTicketId(nextTicketId);
      }
    },
    [currentTicketIndex, tickets, setActiveTicketId]
  );

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {tickets.map((ticket) => (
          <Card
            key={ticket.id}
            className="flex flex-col cursor-pointer hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 rounded-lg overflow-hidden border dark:border-slate-700 bg-card dark:bg-slate-800 group"
            onClick={() => handleOpenDialog(ticket.id)}
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleOpenDialog(ticket.id)}
            aria-label={`View details for ticket for ${ticket.event.name}`}
          >
            {ticket.event.imageUrl && (
              <div className="relative w-full h-48 flex-shrink-0 overflow-hidden">
                <Image
                  src={eventFlyerUrl(ticket.event.imageUrl)!}
                  alt={`Event: ${ticket.event.name}`}
                  layout="fill"
                  objectFit="cover"
                  className="transition-transform duration-500 ease-in-out group-hover:scale-105"
                />
              </div>
            )}
            <CardHeader className="flex-grow p-4">
              <CardTitle className="text-xl font-semibold leading-tight text-card-foreground dark:text-white">
                {ticket.ticketType?.name || 'Standard Ticket'}
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground dark:text-slate-400 mt-1">
                {ticket.event.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 text-sm">
              <div className="flex items-center text-muted-foreground dark:text-slate-300 mb-1">
                <UserIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                <span>
                  {ticket.firstName || 'Attendee'} {ticket.lastName || ''}
                </span>
              </div>
              <div className="flex items-center text-muted-foreground dark:text-slate-300">
                <CalendarDaysIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                <span>{formatDate(ticket.event.startDate)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={isDialogEffectivelyOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseDialog();
        }}
      >
        <DialogContent className="max-w-md p-0 max-h-[90vh] bg-transparent border-none shadow-none dark:bg-transparent focus:outline-none rounded-xl overflow-y-auto">
          {tickets.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateToTicket('prev')}
                disabled={currentTicketIndex === 0}
                className="absolute left-1 sm:left-1.5 top-1/2 -translate-y-1/2 z-50 bg-black/20 hover:bg-black/40 text-white rounded-full h-8 w-8 sm:h-9 sm:w-9 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Previous ticket"
              >
                <ChevronLeftIcon className="h-5 w-5 sm:h-6 sm:w-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateToTicket('next')}
                disabled={currentTicketIndex === tickets.length - 1}
                className="absolute right-1 sm:right-1.5 top-1/2 -translate-y-1/2 z-50 bg-black/20 hover:bg-black/40 text-white rounded-full h-8 w-8 sm:h-9 sm:w-9 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next ticket"
              >
                <ChevronRightIcon className="h-5 w-5 sm:h-6 sm:w-6" />
              </Button>
            </>
          )}

          {currentTicketData && (
            <div className="w-full rounded-xl shadow-xl bg-card dark:bg-slate-850 flex flex-col">
              <AspectRatio
                ratio={1}
                className="  bg-white dark:bg-slate-200 rounded-lg flex items-center justify-center p-2 shadow-md"
              >
                <QRCodeSVG
                  value={currentTicketData.id}
                  size={256}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  marginSize={0}
                />
              </AspectRatio>

              {/* Ticket Details */}
              <div>
                <div className="text-center pt-3 px-4">
                  <h2 className="text-xl sm:text-2xl font-bold text-card-foreground dark:text-white leading-tight">
                    {currentTicketData.event.name}
                  </h2>
                </div>
                <div className="p-4 space-y-3 text-sm">
                  {/* Attendee and Ticket Type Details */}
                  <div className="space-y-3">
                    <div>
                      <p className="font-medium text-muted-foreground flex items-center">
                        <UserIcon className="h-4 w-4 mr-1.5 text-lime-500" />
                        Attendee
                      </p>
                      <p className="text-foreground dark:text-slate-200 pl-6">
                        {currentTicketData.firstName || 'N/A'}{' '}
                        {currentTicketData.lastName || ''}
                      </p>
                      {currentTicketData.email && (
                        <p className="text-xs text-muted-foreground dark:text-slate-400 pl-6">
                          {currentTicketData.email}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground flex items-center">
                        <TicketIcon className="h-4 w-4 mr-1.5 text-sky-500" />
                        Ticket Type
                      </p>
                      <p className="text-foreground dark:text-slate-200 pl-6">
                        {currentTicketData.ticketType?.name || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <hr className="border-border/50 dark:border-slate-700/50" />

                  {/* Event Date and Venue Details */}
                  <div className="space-y-3 overflow-y-auto">
                    <div>
                      <p className="font-medium text-muted-foreground flex items-center">
                        <CalendarDaysIcon className="h-4 w-4 mr-1.5 text-amber-500" />
                        Date
                      </p>
                      <p className="text-foreground dark:text-slate-200 pl-6">
                        {formatDate(currentTicketData.event.startDate)}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground flex items-center">
                        <MapPinIcon className="h-4 w-4 mr-1.5 text-rose-500" />
                        Venue
                      </p>
                      <p className="text-foreground dark:text-slate-200 pl-6">
                        {currentTicketData.event.venue || 'N/A'}
                      </p>
                      {currentTicketData.event.address && (
                        <p className="text-xs text-muted-foreground dark:text-slate-400 pl-6">
                          {currentTicketData.event.address}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Section */}
              <div className="p-4 border-t border-border/50 sticky bottom-0 bg-card dark:bg-slate-850 dark:border-slate-700/50 flex-shrink-0">
                <div className="flex justify-start gap-2 items-center w-full">
                  <p className="text-xs text-muted-foreground dark:text-slate-500 font-mono">
                    {currentTicketData.id}
                  </p>
                  {/* <Button
                    variant="outline"
                    size="icon"
                    aria-label="Download ticket"
                    onClick={() => {
                      alert('Download ticket');
                    }}
                  >
                    <DownloadIcon className="h-4 w-4" />
                  </Button> */}
                  {/* <Button
                    variant="outline"
                    size="icon"
                    aria-label="Add to wallet"
                    onClick={() => {
                      alert('Add to wallet');
                    }}
                  >
                    <WalletIcon className="h-4 w-4" />
                  </Button> */}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
