'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { MapPin, Share2, Check } from 'lucide-react';
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
    card: string;
    cardHeader: string;
    cardPrice: string;
    iconBtn: string;
    cta: string;
    pill: string;
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
    card: 'border border-slate-200 bg-white shadow-sm',
    cardHeader: 'border-slate-200 bg-slate-50 text-slate-500',
    cardPrice: 'text-slate-500',
    iconBtn:
      'border border-slate-200 bg-white/80 text-slate-700 hover:bg-white',
    cta: 'bg-indigo-500 text-white hover:bg-indigo-600',
    pill: 'bg-indigo-500 text-white shadow-xl shadow-indigo-500/30',
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
    card: 'border border-white/60 bg-white/70 shadow-lg backdrop-blur-xl',
    cardHeader: 'border-white/50 bg-white/40 text-slate-600',
    cardPrice: 'text-slate-600',
    iconBtn:
      'border border-white/60 bg-white/60 text-slate-800 backdrop-blur hover:bg-white/80',
    cta: 'bg-indigo-500 text-white hover:bg-indigo-600',
    pill: 'bg-indigo-500 text-white shadow-xl shadow-indigo-900/30',
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
    card: 'border border-white/10 bg-white/10 shadow-2xl backdrop-blur-xl',
    cardHeader: 'border-white/10 bg-white/5 text-white/60',
    cardPrice: 'text-white/70',
    iconBtn:
      'border border-white/15 bg-white/10 text-white backdrop-blur hover:bg-white/20',
    cta: 'bg-indigo-500 text-white hover:bg-indigo-400',
    pill: 'bg-indigo-500 text-white shadow-xl shadow-black/50',
    divider: 'border-white/10',
  },
};

function priceLabelFor(fromPriceCents: number | null): string {
  if (fromPriceCents == null) return 'No tickets available';
  if (fromPriceCents === 0) return 'Free';
  return `From ${getFormattedCurrency(fromPriceCents / 100)} USD`;
}

function ctaLabelFor(fromPriceCents: number | null): string {
  if (fromPriceCents === 0) return 'Get Tickets';
  if (fromPriceCents == null) return 'Get Tickets';
  return `Get tickets from ${getFormattedCurrency(fromPriceCents / 100)}`;
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

              {/* Registration card — the checkout seam (stubbed in Phase 1) */}
              <div
                className={cn(
                  'mt-8 overflow-hidden rounded-2xl transition-shadow',
                  s.card
                )}
              >
                <div
                  className={cn(
                    'border-b px-5 py-3 text-sm font-semibold',
                    s.cardHeader
                  )}
                >
                  Registration
                </div>
                <div className="p-5">
                  <p className={cn('text-sm font-semibold', s.cardPrice)}>
                    {priceLabel}
                  </p>
                  <button
                    type="button"
                    className={cn(
                      'mt-4 w-full rounded-xl px-6 py-3 font-semibold transition-colors',
                      s.cta
                    )}
                  >
                    Get Tickets
                  </button>
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

      {/* Floating CTA pill (Posh-style) — the checkout seam, stubbed for now. */}
      <button
        type="button"
        className={cn(
          'fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-full px-8 py-4 text-base font-bold transition-transform duration-300 hover:scale-[1.03]',
          s.pill,
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
        )}
      >
        {ctaLabelFor(event.fromPriceCents)}
      </button>
    </>
  );
}
