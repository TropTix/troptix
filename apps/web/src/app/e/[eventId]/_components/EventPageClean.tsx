'use client';

import Image from 'next/image';
import { Calendar, MapPin } from 'lucide-react';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';
import { getDateRangeFormatter, getTimeRangeFormatter } from '@/lib/dateUtils';
import { getFormattedCurrency } from '@/lib/utils';
import { Banner } from '@/components/ui/banner';
import { EventById } from '../page';

// Phase 1 scaffold: confirms the `/e/[eventId]` route + data layer is wired
// (event meta, organizer, description, and the "From $X" price derived from the
// fetched tiers). Phase 2 replaces this body with the Clean handoff visuals
// (inset poster hero, summary/meta rows, sticky buy bar). See
// docs/plans/2026-06-event-page-redesign.md.

// "From $X" uses the cheapest non-gated tier (discount-code tiers are hidden
// until unlocked, matching the legacy page).
function fromPrice(event: EventById): number | null {
  const visible = event.ticketTypes.filter(
    (t) => t.discountCode == null || t.discountCode === ''
  );
  if (visible.length === 0) return null;
  return visible.reduce(
    (min, t) => (t.price < min ? t.price : min),
    visible[0].price
  );
}

export default function EventPageClean({ event }: { event: EventById }) {
  const imageUrl = eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE;
  const min = fromPrice(event);
  const priceLabel =
    min != null
      ? `From ${getFormattedCurrency(min)} USD`
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
        <div className="mx-auto w-full max-w-[620px] px-5 pb-24 pt-6">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[22px] shadow-lg">
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
