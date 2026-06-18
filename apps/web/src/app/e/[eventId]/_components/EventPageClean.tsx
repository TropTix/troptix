'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { MapPin, Share2, Check, ArrowRight } from 'lucide-react';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';
import { getDateRangeFormatter, getTimeRangeFormatter } from '@/lib/dateUtils';
import { getFormattedCurrency, cn } from '@/lib/utils';
import { Banner } from '@/components/ui/banner';
import type { EventDetail } from '@troptix/api';

// Phase 1 scaffold with a dev-only style toggle so we can compare three
// directions live: Light (Luma), Hybrid (immersive hero, light body), and Dark
// (Posh). Enhancements: ambient blurred-flyer backdrop, glass cards, floating
// CTA pill, share button, entrance/hover motion. Content is limited to what the
// schema backs. The toggle + variant skinning get trimmed to the chosen look
// before cutover. See docs/plans/2026-06-event-page-redesign.md.

type Variant = 'light' | 'hybrid' | 'dark';

const VARIANT_LABELS: Record<Variant, string> = {
  light: 'Light · Luma',
  hybrid: 'Hybrid',
  dark: 'Dark · Posh',
};

const STYLES: Record<
  Variant,
  {
    backdrop: string; // overlay drawn over the blurred flyer
    backdropImg: string; // opacity/scale on the flyer image itself
    page: string;
    title: string;
    summary: string;
    sectionLabel: string;
    meta: string;
    metaSub: string;
    tile: string;
    iconBtn: string;
    cta: string;
    bar: string;
    divider: string;
  }
> = {
  light: {
    backdrop: 'bg-white/88 backdrop-blur-2xl',
    backdropImg: 'opacity-40',
    page: 'text-slate-900',
    title: 'text-slate-900',
    summary: 'text-slate-500',
    sectionLabel: 'text-slate-400',
    meta: 'text-slate-900',
    metaSub: 'text-slate-500',
    tile: 'border border-slate-200 bg-white text-slate-700',
    iconBtn:
      'border border-slate-200 bg-white/80 text-slate-700 hover:bg-white',
    cta: 'bg-indigo-500 text-white hover:bg-indigo-600',
    bar: 'border-slate-200 bg-white/95',
    divider: 'border-slate-200',
  },
  hybrid: {
    backdrop: 'bg-white/55 backdrop-blur-2xl',
    backdropImg: 'opacity-75',
    page: 'text-slate-900',
    title: 'text-slate-900',
    summary: 'text-slate-600',
    sectionLabel: 'text-slate-500',
    meta: 'text-slate-900',
    metaSub: 'text-slate-600',
    tile: 'border border-white/60 bg-white/70 text-slate-700 backdrop-blur',
    iconBtn:
      'border border-white/60 bg-white/60 text-slate-800 backdrop-blur hover:bg-white/80',
    cta: 'bg-indigo-500 text-white hover:bg-indigo-600',
    bar: 'border-slate-200 bg-white/95',
    divider: 'border-slate-900/10',
  },
  dark: {
    backdrop: 'bg-black/55 backdrop-blur-2xl',
    backdropImg: 'opacity-90',
    page: 'text-white',
    title: 'text-white',
    summary: 'text-white/70',
    sectionLabel: 'text-white/50',
    meta: 'text-white',
    metaSub: 'text-white/60',
    tile: 'border border-white/15 bg-white/10 text-white backdrop-blur',
    iconBtn:
      'border border-white/15 bg-white/10 text-white backdrop-blur hover:bg-white/20',
    cta: 'bg-indigo-500 text-white hover:bg-indigo-400',
    bar: 'border-white/10 bg-neutral-900/95',
    divider: 'border-white/10',
  },
};

function priceLabelFor(fromPriceCents: number | null): string {
  if (fromPriceCents == null) return 'No tickets available';
  if (fromPriceCents === 0) return 'Free';
  return `From ${getFormattedCurrency(fromPriceCents / 100)} USD`;
}

export default function EventPageClean({ event }: { event: EventDetail }) {
  const [variant, setVariant] = useState<Variant>('hybrid');
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setMounted(true), []);

  const s = STYLES[variant];
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

      {/* Ambient backdrop — the flyer, blurred + scaled, with a per-variant wash. */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div
          className={cn(
            'absolute inset-0 scale-110 bg-cover bg-center',
            s.backdropImg
          )}
          style={{
            backgroundImage: `url("${imageUrl}")`,
            filter: 'blur(40px)',
          }}
        />
        <div className={cn('absolute inset-0', s.backdrop)} />
      </div>

      {/* Dev-only preview toggle (removed before cutover). */}
      <div className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 gap-1 rounded-full border border-black/10 bg-white/80 p-1 shadow-lg backdrop-blur">
        {(Object.keys(VARIANT_LABELS) as Variant[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVariant(v)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
              variant === v
                ? 'bg-indigo-500 text-white'
                : 'text-slate-600 hover:bg-black/5'
            )}
          >
            {VARIANT_LABELS[v]}
          </button>
        ))}
      </div>

      <main
        className={cn(
          'min-h-screen pb-32 transition-opacity duration-700',
          s.page,
          mounted ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div className="mx-auto w-full max-w-5xl px-5 py-10 md:px-8 md:py-16">
          <div className="md:grid md:grid-cols-[minmax(0,380px)_1fr] md:items-start md:gap-12">
            {/* Left aside — sticky on desktop */}
            <aside className="md:sticky md:top-10">
              <div className="group relative aspect-square w-full overflow-hidden rounded-2xl shadow-2xl transition-transform duration-300 hover:-translate-y-1">
                <Image
                  src={imageUrl}
                  alt={event.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 380px"
                  className="object-cover"
                  priority
                />
              </div>

              <div className={cn('mt-5 border-t pt-5', s.divider)}>
                <p
                  className={cn(
                    'text-xs font-semibold uppercase tracking-wide',
                    s.sectionLabel
                  )}
                >
                  Presented by
                </p>
                <p className={cn('mt-1 font-semibold', s.meta)}>
                  {event.organizer}
                </p>
              </div>
            </aside>

            {/* Right main column */}
            <div className="mt-8 min-w-0 md:mt-0">
              <div className="flex items-start justify-between gap-4">
                <h1
                  className={cn(
                    'text-3xl font-extrabold tracking-tight md:text-5xl',
                    s.title
                  )}
                >
                  {event.name}
                </h1>
                <button
                  type="button"
                  onClick={onShare}
                  aria-label="Share event"
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
                    s.iconBtn
                  )}
                >
                  {copied ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Share2 className="h-5 w-5" />
                  )}
                </button>
              </div>
              {event.summary && (
                <p className={cn('mt-3 text-lg', s.summary)}>{event.summary}</p>
              )}

              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl',
                      s.tile
                    )}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                      {badgeMonth}
                    </span>
                    <span className="text-lg font-bold leading-none">
                      {badgeDay}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className={cn('font-semibold', s.meta)}>
                      {getDateRangeFormatter(start, end)}
                    </div>
                    <div className={cn('text-sm', s.metaSub)}>
                      {getTimeRangeFormatter(start, end)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span
                    className={cn(
                      'grid h-14 w-14 shrink-0 place-items-center rounded-xl',
                      s.tile
                    )}
                  >
                    <MapPin className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <div className={cn('font-semibold', s.meta)}>
                      {event.venue ?? event.address}
                    </div>
                    <div className={cn('text-sm', s.metaSub)}>
                      {event.address}
                    </div>
                  </div>
                </div>
              </div>

              {event.description && (
                <section className="mt-10">
                  <h2
                    className={cn(
                      'border-b pb-2 text-sm font-semibold uppercase tracking-wide',
                      s.divider,
                      s.sectionLabel
                    )}
                  >
                    About Event
                  </h2>
                  <p
                    className={cn(
                      'mt-4 whitespace-pre-wrap leading-relaxed',
                      s.metaSub
                    )}
                  >
                    {event.description}
                  </p>
                </section>
              )}

              <section className="mt-10">
                <h2
                  className={cn(
                    'border-b pb-2 text-sm font-semibold uppercase tracking-wide',
                    s.divider,
                    s.sectionLabel
                  )}
                >
                  Location
                </h2>
                <p className={cn('mt-4 font-semibold', s.meta)}>
                  {event.venue ?? 'Venue'}
                </p>
                <p className={cn('text-sm', s.metaSub)}>{event.address}</p>
                {/* Map lands in Phase 2 (Google Maps + lat/lng). */}
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Sticky "Get Tickets" bar (original design) — solid surface so the
          text stays readable over the ambient backdrop. The checkout seam is
          stubbed in Phase 1. */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-xl transition-transform duration-300',
          s.bar,
          mounted ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <div className={cn('text-lg font-extrabold', s.meta)}>
              {priceLabel}
            </div>
            <div className={cn('text-xs', s.metaSub)}>
              fees calculated at checkout
            </div>
          </div>
          <button
            type="button"
            className={cn(
              'flex h-12 shrink-0 items-center gap-2 rounded-2xl px-6 font-bold transition-colors',
              s.cta
            )}
          >
            {event.fromPriceCents === 0 ? 'RSVP' : 'Get Tickets'}
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </>
  );
}
