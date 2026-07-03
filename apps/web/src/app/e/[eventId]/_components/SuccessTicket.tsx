'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Ticket, Share2, Check } from 'lucide-react';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import type { EventDetail } from '@troptix/api';

// Post-checkout confirmation: poster-forward on a light tinted field, with a
// single "View tickets" action that hands off to the real swipeable QR view
// The QR lives only there — never inline here.
export default function SuccessTicket({
  event,
  orderId,
  tickets,
}: {
  event: EventDetail;
  orderId: string;
  tickets: { id: string; ticketTypeName: string | null }[];
}) {
  const { copyToClipboard } = useCopyToClipboard();

  const qty = tickets.length;
  const poster = eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE;
  const start = new Date(event.startDate);
  const dateLine = `${start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} at ${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

  const ticketsHref = `/orders/${orderId}/tickets`;

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
        <Link
          href={ticketsHref}
          className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 font-bold text-white shadow-lg transition-transform hover:scale-[1.01]"
        >
          <Ticket className="h-5 w-5" /> View tickets
        </Link>
        <button
          type="button"
          onClick={onShare}
          aria-label="Share"
          className="grid h-[52px] w-[52px] place-items-center rounded-2xl border border-black/10 bg-black/5 text-foreground transition-colors hover:bg-black/10"
        >
          <Share2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
