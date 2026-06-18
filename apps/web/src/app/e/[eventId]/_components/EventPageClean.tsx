'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { MapPin, Share2, Check, ArrowRight } from 'lucide-react';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';
import { getDateRangeFormatter, getTimeRangeFormatter } from '@/lib/dateUtils';
import { getFormattedCurrency, cn } from '@/lib/utils';
import { Banner } from '@/components/ui/banner';
import type { EventDetail } from '@troptix/api';

// Event page — Luma-light direction. Two-column on desktop (sticky poster aside
// + main column), stacked on mobile, with a subtle flyer-tinted backdrop, glass
// tiles, share button, and the original sticky Get-Tickets bar. Content is
// limited to what the schema backs. Map + the checkout seam land in Phase 2.
// See docs/plans/2026-06-event-page-redesign.md.

function priceLabelFor(fromPriceCents: number | null): string {
  if (fromPriceCents == null) return 'No tickets available';
  if (fromPriceCents === 0) return 'Free';
  return `From ${getFormattedCurrency(fromPriceCents / 100)} USD`;
}

const SECTION_LABEL =
  'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

export default function EventPageClean({ event }: { event: EventDetail }) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setMounted(true), []);

  const imageUrl = eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE;
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const badgeMonth = start
    .toLocaleString('en-US', { month: 'short' })
    .toUpperCase();
  const badgeDay = start.getDate();
  const priceLabel = priceLabelFor(event.fromPriceCents);

  async function onShare() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    try {
      if (navigator.share) {
        await navigator.share({ title: event.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      /* user dismissed the share sheet — no-op */
    }
  }

  return (
    <>
      {event.isDraft && (
        <Banner
          title="Draft Mode: Event Not Published"
          message="This event is currently a draft. Only you, as the organizer, can view it. Make any changes you need, then publish when you're ready to go live."
          type="warning"
        />
      )}

      {/* Subtle flyer-tinted backdrop — a faint colour glow over a light base,
          fading to solid so the page stays clean and readable. */}
      <div className="fixed inset-0 -z-10 bg-background">
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center opacity-20"
          style={{
            backgroundImage: `url("${imageUrl}")`,
            filter: 'blur(64px)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/90 to-background" />
      </div>

      <main
        className={cn(
          'min-h-screen pb-32 text-foreground transition-opacity duration-700',
          mounted ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="mx-auto w-full max-w-5xl px-5 py-10 md:px-8 md:py-14">
          <div className="md:grid md:grid-cols-[minmax(0,380px)_1fr] md:items-start md:gap-12">
            {/* Left aside — sticky on desktop */}
            <aside className="md:sticky md:top-20">
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl shadow-xl transition-transform duration-300 hover:-translate-y-1">
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
                <p className={SECTION_LABEL}>Presented by</p>
                <p className="mt-1 font-semibold">{event.organizer}</p>
              </div>
            </aside>

            {/* Right main column */}
            <div className="mt-8 min-w-0 md:mt-0">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
                  {event.name}
                </h1>
                <button
                  type="button"
                  onClick={onShare}
                  aria-label="Share event"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted"
                >
                  {copied ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Share2 className="h-5 w-5" />
                  )}
                </button>
              </div>
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

              {event.description && (
                <section className="mt-10">
                  <h2
                    className={cn('border-b border-border pb-2', SECTION_LABEL)}
                  >
                    About Event
                  </h2>
                  <p className="mt-4 whitespace-pre-wrap leading-relaxed text-muted-foreground">
                    {event.description}
                  </p>
                </section>
              )}

              <section className="mt-10">
                <h2
                  className={cn('border-b border-border pb-2', SECTION_LABEL)}
                >
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

      {/* Sticky Get-Tickets bar (original design) — solid surface for contrast.
          The checkout seam is stubbed in Phase 1. */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl transition-transform duration-300',
          mounted ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-extrabold">{priceLabel}</div>
            <div className="text-xs text-muted-foreground">
              fees calculated at checkout
            </div>
          </div>
          <button
            type="button"
            className="flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-primary px-6 font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {event.fromPriceCents === 0 ? 'RSVP' : 'Get Tickets'}
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </>
  );
}
