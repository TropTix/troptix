'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Ticket, Share2, Check, X, Lock } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import type { EventDetail } from '@troptix/api';

// Shareable confirmation (Style D from the shared design): the confirmation IS
// the social card — poster-forward on a light tinted field, with a buyer dock
// ("View ticket & QR" + Share). The private QR lives behind "View ticket", never
// on the shared card.
export default function SuccessTicket({
  event,
  orderId,
  tickets,
}: {
  event: EventDetail;
  orderId: string;
  tickets: { id: string; ticketTypeName: string | null }[];
}) {
  const [passOpen, setPassOpen] = useState(false);
  const { copyToClipboard } = useCopyToClipboard();

  const qty = tickets.length;
  const first = tickets[0];
  const poster = eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE;
  const start = new Date(event.startDate);
  const dateLine = `${start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} at ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  const dayLabel = start.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const code = `TT-${(first?.id ?? orderId).replace(/-/g, '').slice(0, 6).toUpperCase()}`;

  async function onShare() {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/e/${event.id}`
        : '';
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.name,
          text: `I'm going to ${event.name}!`,
          url,
        });
      } catch {
        /* dismissed */
      }
      return;
    }
    void copyToClipboard(url);
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-accent">
      <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-28 pt-12 text-center">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-white text-primary shadow-sm">
          <span className="text-xl font-black tracking-tighter">T</span>
        </div>
        <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-foreground">
          {event.name}
        </h2>
        <p className="mt-2 whitespace-pre-line text-sm font-medium leading-relaxed text-muted-foreground">
          {`${event.venue ?? event.address}\n${dateLine}`}
        </p>
        <p className="mt-2.5 inline-flex items-center justify-center gap-1.5 text-sm font-bold text-primary">
          <Check className="h-4 w-4" /> Order confirmed · {qty}{' '}
          {qty === 1 ? 'ticket' : 'tickets'}
        </p>

        <div className="relative mx-auto mt-5 aspect-[4/5] w-full max-w-[300px] overflow-hidden rounded-3xl shadow-2xl duration-500 animate-in fade-in zoom-in-95">
          <Image
            src={poster}
            alt={event.name}
            fill
            sizes="(max-width: 640px) 100vw, 300px"
            className="object-cover"
          />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex gap-2.5 bg-gradient-to-t from-accent via-accent/90 to-transparent px-4 pb-5 pt-6">
        <button
          type="button"
          onClick={() => setPassOpen(true)}
          className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 font-bold text-white shadow-lg transition-transform hover:scale-[1.01]"
        >
          <Ticket className="h-5 w-5" /> View ticket &amp; QR
        </button>
        <button
          type="button"
          onClick={onShare}
          aria-label="Share"
          className="grid h-[52px] w-[52px] place-items-center rounded-2xl border border-black/10 bg-black/5 text-foreground transition-colors hover:bg-black/10"
        >
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      {passOpen && (
        <>
          <button
            type="button"
            aria-label="Close pass"
            onClick={() => setPassOpen(false)}
            className="absolute inset-0 z-20 bg-black/50 backdrop-blur-sm animate-in fade-in"
          />
          <div className="absolute inset-x-2 bottom-2 z-30 overflow-hidden rounded-3xl bg-card shadow-2xl duration-300 animate-in slide-in-from-bottom">
            <div className="flex items-start justify-between px-5 pb-3 pt-5">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
                  Your pass · private
                </div>
                <div className="mt-0.5 truncate text-lg font-extrabold">
                  {event.name}
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setPassOpen(false)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mx-5 mb-3.5 flex flex-col items-center rounded-2xl border border-border bg-muted/40 px-4 py-5">
              <div className="rounded-xl bg-white p-3 shadow-sm">
                {first && <QRCodeSVG value={first.id} size={150} />}
              </div>
              <div className="mt-3 font-mono text-xs tracking-widest text-muted-foreground">
                {code}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Admits {qty} · {dayLabel}
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5 px-5 pb-3 text-center text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5 shrink-0" /> Only you can see this —
              it never appears on a shared card
            </div>

            <div className="px-4 pb-4">
              <Link
                href={`/orders/${orderId}/tickets`}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-neutral-900 font-semibold text-white"
              >
                View all tickets
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
