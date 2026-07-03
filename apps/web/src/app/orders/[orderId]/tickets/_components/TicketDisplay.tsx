'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CalendarDays, MapPin } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export type TicketInfo = {
  id: string;
  status: string;
  firstName: string;
  lastName: string;
  email: string;
  ticketType: { name: string };
  event: {
    name: string;
    imageUrl: string;
    startDate: Date;
    venue: string;
    address: string;
  };
};

const VOID_STATUSES = new Set(['CANCELLED', 'REFUNDED']);

function formatDate(date: Date | string) {
  return new Date(date).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Short, human-readable code shown under the QR (the QR itself encodes the id). */
function shortCode(id: string) {
  return `TT-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

export default function TicketDisplayManager({
  tickets,
  ticketId,
  orderId,
}: {
  tickets: TicketInfo[];
  ticketId?: string;
  orderId: string;
}) {
  const startIndex = useMemo(() => {
    const i = tickets.findIndex((t) => t.id === ticketId);
    return i >= 0 ? i : 0;
  }, [tickets, ticketId]);

  const [index, setIndex] = useState(startIndex);
  const total = tickets.length;
  const ticket = tickets[index];
  const isVoid = VOID_STATUSES.has(ticket.status);
  const voidLabel = ticket.status === 'REFUNDED' ? 'Refunded' : 'Cancelled';

  function go(dir: -1 | 1) {
    setIndex((i) => Math.min(Math.max(i + dir, 0), total - 1));
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col bg-white px-5 pb-8 pt-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/orders/${orderId}`}
          aria-label="Back to order"
          className="grid h-9 w-9 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <span className="font-mono text-xs font-semibold tracking-[0.14em] text-muted-foreground">
          TICKET {String(index + 1).padStart(2, '0')} /{' '}
          {String(total).padStart(2, '0')}
        </span>
        <span className="h-9 w-9" aria-hidden />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center">
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0}
              aria-label="Previous ticket"
              className="absolute left-0 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted disabled:opacity-25"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={index === total - 1}
              aria-label="Next ticket"
              className="absolute right-0 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted disabled:opacity-25"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}

        <div className="w-full px-6 text-center">
          <div className="relative mx-auto h-[236px] w-[236px]">
            <div className={isVoid ? 'opacity-20' : ''}>
              <QRCodeSVG
                value={ticket.id}
                size={236}
                level="H"
                bgColor="#ffffff"
                fgColor="#0f172a"
                marginSize={0}
              />
            </div>
            {/* Brand mark centered over the code — level "H" tolerates the occlusion. */}
            {!isVoid && (
              <div className="absolute left-1/2 top-1/2 grid h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[14px] bg-primary shadow-[0_0_0_7px_#fff]">
                <span className="-mt-0.5 text-3xl font-extrabold leading-none text-primary-foreground">
                  T
                </span>
              </div>
            )}
            {isVoid && (
              <div className="absolute inset-0 grid place-items-center">
                <span className="rounded-md bg-destructive/10 px-3 py-1 font-mono text-sm font-bold uppercase tracking-[0.1em] text-destructive">
                  {voidLabel}
                </span>
              </div>
            )}
          </div>

          <p className="mt-4 font-mono text-[11px] font-medium tracking-[0.14em] text-muted-foreground">
            {isVoid ? 'NOT VALID FOR ENTRY' : 'SCAN AT THE DOOR'}
          </p>

          <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-foreground">
            {ticket.event.name}
          </h1>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            {formatDate(ticket.event.startDate)}
          </p>
          {(ticket.event.venue || ticket.event.address) && (
            <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {ticket.event.venue || ticket.event.address}
            </p>
          )}

          <div className="mt-5 flex items-stretch justify-between gap-4 border-t border-border pt-4 text-left">
            <div className="min-w-0">
              <div className="font-mono text-[9.5px] font-medium tracking-[0.15em] text-muted-foreground">
                ATTENDEE
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-foreground">
                {ticket.firstName || 'Guest'} {ticket.lastName}
              </div>
            </div>
            <div className="min-w-0 text-right">
              <div className="font-mono text-[9.5px] font-medium tracking-[0.15em] text-muted-foreground">
                ADMISSION
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-foreground">
                {ticket.ticketType.name}
              </div>
            </div>
          </div>

          <div className="mt-4 font-mono text-[13px] font-semibold tracking-[0.2em] text-foreground">
            {shortCode(ticket.id)}
          </div>
        </div>
      </div>

      {total > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-4">
          {tickets.map((t, i) => (
            <button
              key={t.id}
              type="button"
              aria-label={`Go to ticket ${i + 1}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={
                i === index
                  ? 'h-[7px] w-5 rounded bg-primary transition-all'
                  : 'h-[7px] w-[7px] rounded-full bg-muted-foreground/30 transition-all'
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
