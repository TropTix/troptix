'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowLeft,
  Share2,
  Check,
  Calendar,
  MapPin,
  ArrowRight,
} from 'lucide-react';
import { eventFlyerUrl, DEFAULT_EVENT_IMAGE } from '@/lib/supabase/storage';
import { getDateRangeFormatter, getTimeRangeFormatter } from '@/lib/dateUtils';
import { getFormattedCurrency, cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Banner } from '@/components/ui/banner';
import type { EventDetail } from '@troptix/api';
import TicketSelectionSheet, {
  type TicketSelection,
} from './TicketSelectionSheet';

// Public event page (Luma-light). Immersive poster hero on mobile, two-column
// on desktop. See docs/plans/2026-06-event-page-redesign.md.

function priceLabelFor(fromPriceCents: number | null): string {
  if (fromPriceCents == null) return 'No tickets available';
  if (fromPriceCents === 0) return 'Free';
  return `From ${getFormattedCurrency(fromPriceCents / 100)} USD`;
}

const SECTION_LABEL =
  'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

const META_TILE =
  'grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground';

const ROUND_BTN =
  'grid h-10 w-10 place-items-center rounded-full text-foreground transition-colors';

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className={cn('border-b border-border pb-2', SECTION_LABEL)}>
      {children}
    </h2>
  );
}

function MetaRow({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className={META_TILE}>{icon}</span>
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}

export default function EventPageClean({ event }: { event: EventDetail }) {
  const router = useRouter();
  const [accent, setAccent] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const isFree = event.fromPriceCents === 0;

  // Commit seam: next slice wires this to createReservation.
  function onCommit(_selection: TicketSelection) {
    setSheetOpen(false);
  }

  const imageUrl = eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE;

  // Saturation-weighted average so a vibrant subject wins over a dark
  // background; falls back to null (no halo) if the canvas is CORS-tainted.
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
          const w = sat * sat + 0.05;
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
        /* tainted canvas (CORS) — no halo */
      }
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const heroChip = `${start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })} · ${start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
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

  const shareIcon = isCopied ? (
    <Check className="h-5 w-5" />
  ) : (
    <Share2 className="h-5 w-5" />
  );

  return (
    <>
      {event.isDraft && (
        <Banner
          title="Draft Mode: Event Not Published"
          message="This event is currently a draft. Only you, as the organizer, can view it. Make any changes you need, then publish when you're ready to go live."
          type="warning"
        />
      )}

      <main className="min-h-screen bg-background pb-32 text-foreground">
        {/* Mobile: immersive poster hero with floating controls + date chip. */}
        <div className="relative md:hidden">
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-b-3xl">
            <Image
              src={imageUrl}
              alt={event.name}
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {heroChip}
            </span>
          </div>
          <div className="absolute inset-x-4 top-4 flex items-center justify-between">
            <button
              type="button"
              aria-label="Back"
              onClick={() => router.back()}
              className={cn(ROUND_BTN, 'bg-white/85 shadow backdrop-blur')}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Share event"
              onClick={onShare}
              className={cn(ROUND_BTN, 'bg-white/85 shadow backdrop-blur')}
            >
              {shareIcon}
            </button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-5xl px-5 py-6 md:px-8 md:py-14">
          <div className="md:grid md:grid-cols-[minmax(0,380px)_1fr] md:items-start md:gap-12">
            {/* Desktop: poster aside with a soft flyer-coloured halo. */}
            <aside className="hidden md:block md:sticky md:top-20">
              <div className="relative">
                {accent && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -inset-4 rounded-[2rem] opacity-70 blur-3xl"
                    style={{
                      background: `radial-gradient(circle, rgba(${accent}, 0.4), transparent 70%)`,
                    }}
                  />
                )}
                <div className="relative aspect-square w-full overflow-hidden rounded-2xl shadow-xl">
                  <Image
                    src={imageUrl}
                    alt={event.name}
                    fill
                    sizes="380px"
                    className="object-cover"
                    priority
                  />
                </div>
              </div>
              <div className="mt-5 border-t border-border pt-5">
                <p className={SECTION_LABEL}>Presented by</p>
                <p className="mt-1 font-semibold">{event.organizer}</p>
              </div>
            </aside>

            <div className="min-w-0">
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
                  {event.name}
                </h1>
                <button
                  type="button"
                  aria-label="Share event"
                  onClick={onShare}
                  className={cn(
                    ROUND_BTN,
                    'hidden shrink-0 border border-border bg-card hover:bg-muted md:grid'
                  )}
                >
                  {shareIcon}
                </button>
              </div>
              {event.summary && (
                <p className="mt-3 text-lg text-muted-foreground">
                  {event.summary}
                </p>
              )}

              <div className="mt-6 space-y-3">
                <MetaRow
                  icon={<Calendar className="h-6 w-6" />}
                  title={getDateRangeFormatter(start, end)}
                  subtitle={getTimeRangeFormatter(start, end)}
                />
                <MetaRow
                  icon={<MapPin className="h-6 w-6" />}
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
                {/* TODO: venue map (Phase 2) */}
              </section>

              {/* Organizer shows in the aside on desktop; surface it here on mobile. */}
              <section className="mt-10 md:hidden">
                <SectionHeader>Hosted by</SectionHeader>
                <p className="mt-3 font-semibold">{event.organizer}</p>
              </section>
            </div>
          </div>
        </div>
      </main>

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
