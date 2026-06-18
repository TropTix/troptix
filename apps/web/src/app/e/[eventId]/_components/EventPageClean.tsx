'use client';

import Image from 'next/image';
import { Calendar, MapPin } from 'lucide-react';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';
import { getDateRangeFormatter, getTimeRangeFormatter } from '@/lib/dateUtils';
import { getFormattedCurrency } from '@/lib/utils';
import { Banner } from '@/components/ui/banner';
import type { EventDetail } from '@troptix/api';

// Phase 1 scaffold: confirms the `/e/[eventId]` route + data layer is wired
// (event meta, organizer, description, and the server-computed "From $X").
// Phase 2 replaces this body with the Clean handoff visuals (inset poster hero,
// summary/meta rows, sticky buy bar). See
// docs/plans/2026-06-event-page-redesign.md.

export default function EventPageClean({ event }: { event: EventDetail }) {
  const imageUrl = eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE;
  const priceLabel =
    event.fromPriceCents != null
      ? `From ${getFormattedCurrency(event.fromPriceCents / 100)} USD`
      : 'No tickets available';

  return (
    <>
      {event.isDraft && (
        <Banner
          title="Draft Mode: Event Not Published"
          message="This event is currently a draft. Only you, as the organizer, can view it. Make any changes you need, then publish when you're ready to go live."
          type="warning"
        />
      )}
      <main className="min-h-screen bg-background text-foreground">
        {/* Full-bleed on mobile; centered 620px column on desktop (handoff). */}
        <div className="mx-auto w-full px-5 pb-24 pt-6 md:max-w-[620px] md:px-7">
          {/* Portrait poster on mobile, landscape on desktop (handoff). */}
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[22px] shadow-lg md:aspect-[3/2]">
            <Image
              src={imageUrl}
              alt={event.name}
              fill
              sizes="(max-width: 640px) 100vw, 620px"
              className="object-cover"
              priority
            />
          </div>

          <h1 className="mt-6 text-3xl font-extrabold tracking-tight">
            {event.name}
          </h1>
          {event.summary && (
            <p className="mt-2 text-base text-muted-foreground">
              {event.summary}
            </p>
          )}

          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-muted">
                <Calendar className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="font-semibold">
                  {getDateRangeFormatter(
                    new Date(event.startDate),
                    new Date(event.endDate)
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {getTimeRangeFormatter(
                    new Date(event.startDate),
                    new Date(event.endDate)
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-muted">
                <MapPin className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="font-semibold">
                  {event.venue ?? 'Venue TBA'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {event.address}
                </div>
              </div>
            </div>
          </div>

          <p className="mt-5 text-sm font-semibold text-muted-foreground">
            {priceLabel}
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            by {event.organizer}
          </p>

          {event.description && (
            <p className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/80">
              {event.description}
            </p>
          )}
        </div>
      </main>
    </>
  );
}
