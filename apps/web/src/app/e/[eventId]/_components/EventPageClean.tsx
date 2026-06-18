'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { MapPin, Share2, Check, ArrowRight } from 'lucide-react';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';
import { getDateRangeFormatter, getTimeRangeFormatter } from '@/lib/dateUtils';
import { getFormattedCurrency, cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Banner } from '@/components/ui/banner';
import type { EventDetail } from '@troptix/api';
import TicketSelectionSheet, {
  type TicketSelection,
} from './TicketSelectionSheet';

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

const META_TILE = 'h-14 w-14 shrink-0 rounded-xl border border-border bg-card';

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className={cn('border-b border-border pb-2', SECTION_LABEL)}>
      {children}
    </h2>
  );
}

function MetaRow({
  leading,
  title,
  subtitle,
}: {
  leading: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-4">
      {leading}
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}

export default function EventPageClean({ event }: { event: EventDetail }) {
  // Representative "r, g, b" sampled from the flyer for a light backdrop glow.
  const [accent, setAccent] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const isFree = event.fromPriceCents === 0;

  // Commit seam → next slice wires this to createReservation + the reservation
  // route. For now it just closes the sheet.
  function onCommit(_selection: TicketSelection) {
    setSheetOpen(false);
  }

  const imageUrl = eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE;

  // Sample a representative colour from the flyer: a saturation-weighted average
  // so a vibrant subject wins over a dark/neutral background. Falls back
  // silently (accent stays null → blurred-flyer backdrop) if the canvas is
  // tainted by CORS.
  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0;
        let g = 0;
        let b = 0;
        let wSum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const R = data[i];
          const G = data[i + 1];
          const B = data[i + 2];
          const max = Math.max(R, G, B);
          const min = Math.min(R, G, B);
          const sat = max === 0 ? 0 : (max - min) / max;
          const w = sat * sat + 0.05; // bias toward colourful pixels
          r += R * w;
          g += G * w;
          b += B * w;
          wSum += w;
        }
        if (!cancelled && wSum > 0) {
          const round = (n: number) => Math.round(n / wSum);
          setAccent(`${round(r)}, ${round(g)}, ${round(b)}`);
        }
      } catch {
        /* tainted canvas (CORS) — keep the blurred-flyer fallback */
      }
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const badgeMonth = start
    .toLocaleString('en-US', { month: 'short' })
    .toUpperCase();
  const badgeDay = start.getDate();
  const priceLabel = priceLabelFor(event.fromPriceCents);

  async function onShare() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (navigator.share) {
      try {
        await navigator.share({ title: event.name, url });
      } catch {
        /* user dismissed the share sheet — no-op */
      }
      return;
    }
    void copyToClipboard(url);
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

      {/* Subtle flyer-tinted backdrop — a light glow of the colour sampled from
          the flyer (blurred flyer as fallback), fading to solid so the page
          stays clean and readable. */}
      <div className="fixed inset-0 -z-10 bg-background">
        {accent ? (
          <div
            className="absolute inset-0 transition-opacity duration-700"
            style={{
              background: `radial-gradient(90% 55% at 50% -5%, rgba(${accent}, 0.35), rgba(${accent}, 0) 70%)`,
            }}
          />
        ) : (
          <div
            className="absolute inset-0 scale-110 bg-cover bg-center opacity-20"
            style={{
              backgroundImage: `url("${imageUrl}")`,
              filter: 'blur(64px)',
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/70 to-background" />
      </div>

      <main className="min-h-screen animate-in pb-32 text-foreground duration-700 fade-in">
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
                  {isCopied ? (
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
                <MetaRow
                  leading={
                    <div
                      className={cn(
                        'flex flex-col items-center justify-center',
                        META_TILE
                      )}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {badgeMonth}
                      </span>
                      <span className="text-lg font-bold leading-none">
                        {badgeDay}
                      </span>
                    </div>
                  }
                  title={getDateRangeFormatter(start, end)}
                  subtitle={getTimeRangeFormatter(start, end)}
                />
                <MetaRow
                  leading={
                    <span
                      className={cn(
                        'grid place-items-center text-muted-foreground',
                        META_TILE
                      )}
                    >
                      <MapPin className="h-6 w-6" />
                    </span>
                  }
                  title={event.venue ?? event.address}
                  subtitle={event.address}
                />
              </div>

              {event.description && (
                <section className="mt-10">
                  <SectionHeader>About Event</SectionHeader>
                  <p className="mt-4 whitespace-pre-wrap leading-relaxed text-muted-foreground">
                    {event.description}
                  </p>
                </section>
              )}

              <section className="mt-10">
                <SectionHeader>Location</SectionHeader>
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
      <div className="fixed inset-x-0 bottom-0 z-40 animate-in border-t border-border bg-background/95 backdrop-blur-xl duration-300 slide-in-from-bottom">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-extrabold">{priceLabel}</div>
            <div className="text-xs text-muted-foreground">
              fees calculated at checkout
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-primary px-6 font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {isFree ? 'RSVP' : 'Get Tickets'}
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <TicketSelectionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        eventName={event.name}
        tickets={event.tickets}
        isFree={isFree}
        onCommit={onCommit}
      />
    </>
  );
}
