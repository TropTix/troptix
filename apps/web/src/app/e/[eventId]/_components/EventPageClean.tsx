'use client';

import Image from 'next/image';
import { MapPin } from 'lucide-react';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';
import { getDateRangeFormatter, getTimeRangeFormatter } from '@/lib/dateUtils';
import { getFormattedCurrency } from '@/lib/utils';
import { Banner } from '@/components/ui/banner';
import type { EventDetail } from '@troptix/api';

// Phase 1 scaffold, Luma-style two-column desktop: a sticky left aside (poster +
// organizer) and a right main column (title, date/location, registration card,
// about, location). Stacks to a single column on mobile. Content is limited to
// what the schema backs — no featured chip / follow / socials / multi-host /
// going-count. Phase 2 wires the real CTA seam, the map, and component
// extraction. See docs/plans/2026-06-event-page-redesign.md.

function priceLabelFor(fromPriceCents: number | null): string {
  if (fromPriceCents == null) return 'No tickets available';
  if (fromPriceCents === 0) return 'Free';
  return `From ${getFormattedCurrency(fromPriceCents / 100)} USD`;
}

export default function EventPageClean({ event }: { event: EventDetail }) {
  const imageUrl = eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE;
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const badgeMonth = start
    .toLocaleString('en-US', { month: 'short' })
    .toUpperCase();
  const badgeDay = start.getDate();
  const priceLabel = priceLabelFor(event.fromPriceCents);

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
        <div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8 md:py-12">
          <div className="md:grid md:grid-cols-[minmax(0,380px)_1fr] md:items-start md:gap-12">
            {/* Left aside — sticky on desktop */}
            <aside className="md:sticky md:top-8">
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl shadow-lg">
                <Image
                  src={imageUrl}
                  alt={event.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 380px"
                  className="object-cover"
                  priority
                />
              </div>

              <div className="mt-5 border-t border-border pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Presented by
                </p>
                <p className="mt-1 font-semibold">{event.organizer}</p>
              </div>
            </aside>

            {/* Right main column */}
            <div className="mt-8 min-w-0 md:mt-0">
              <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
                {event.name}
              </h1>
              {event.summary && (
                <p className="mt-3 text-lg text-muted-foreground">
                  {event.summary}
                </p>
              )}

              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-border bg-card">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {badgeMonth}
                    </span>
                    <span className="text-lg font-bold leading-none">
                      {badgeDay}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {getDateRangeFormatter(start, end)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {getTimeRangeFormatter(start, end)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground">
                    <MapPin className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {event.venue ?? event.address}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {event.address}
                    </div>
                  </div>
                </div>
              </div>

              {/* Registration card — the checkout seam (stubbed in Phase 1) */}
              <div className="mt-8 overflow-hidden rounded-2xl border border-border">
                <div className="border-b border-border bg-muted/40 px-5 py-3 text-sm font-semibold text-muted-foreground">
                  Registration
                </div>
                <div className="p-5">
                  <p className="text-sm font-semibold text-muted-foreground">
                    {priceLabel}
                  </p>
                  <button
                    type="button"
                    className="mt-4 w-full rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Get Tickets
                  </button>
                </div>
              </div>

              {event.description && (
                <section className="mt-10">
                  <h2 className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    About Event
                  </h2>
                  <p className="mt-4 whitespace-pre-wrap leading-relaxed text-foreground/80">
                    {event.description}
                  </p>
                </section>
              )}

              <section className="mt-10">
                <h2 className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Location
                </h2>
                <p className="mt-4 font-semibold">{event.venue ?? 'Venue'}</p>
                <p className="text-sm text-muted-foreground">{event.address}</p>
                {/* Map lands in Phase 2 (Google Maps + lat/lng). */}
              </section>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
