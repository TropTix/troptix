'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  MapPin,
  Sparkles,
  Ticket,
  Users,
  Wallet,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

const FEATURED_EVENT_IMAGE = '/images/events/sunset-fete.jpg';

export default function LandingHero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden bg-[#07051a] text-white -mt-16 pt-16"
    >
      <HeroBackground />

      <div className="relative z-10 container mx-auto px-5 sm:px-6 lg:px-8 pt-5 pb-10 sm:pt-10 sm:pb-12 lg:pt-12 lg:pb-14">
        <div className="grid lg:grid-cols-12 gap-6 lg:gap-12 items-center">
          <HeroCopy />
          <HeroVisuals />
        </div>

        <StatsRow />
      </div>
    </section>
  );
}

function HeroBackground() {
  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      {/* Painterly night sky — warm horizon, magenta wash, purple stage bloom, cool sky */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            // Warm sunset / stage glow rising from below the frame
            'radial-gradient(95% 60% at 50% 115%, rgba(255, 130, 100, 0.55), transparent 55%)',
            // Magenta wash just above the horizon
            'radial-gradient(70% 50% at 50% 80%, rgba(236, 72, 153, 0.42), transparent 60%)',
            // Primary purple bloom upper-left
            'radial-gradient(65% 55% at 15% 8%, hsl(var(--primary) / 0.55), transparent 60%)',
            // Cool sky accent upper-right
            'radial-gradient(55% 50% at 90% 22%, rgba(56, 189, 248, 0.28), transparent 60%)',
            // Base night sky
            'linear-gradient(180deg, #08061d 0%, #0a0824 45%, #07051a 100%)',
          ].join(', '),
        }}
      />

      {/* Horizon haze line — a soft pink streak that implies distance and crowd silhouette */}
      <div
        className="absolute inset-x-0 bottom-[28%] h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255, 180, 210, 0.18) 25%, rgba(255, 180, 210, 0.35) 50%, rgba(255, 180, 210, 0.18) 75%, transparent 100%)',
          boxShadow: '0 0 28px 10px rgba(255, 160, 200, 0.16)',
        }}
      />

      {/* Cinematic vignette — heavier on edges so subjects pop */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,_transparent_45%,_rgba(4,3,15,0.85)_100%)]" />

      {/* Stage spotlight beam — anchors the visuals, gives crowd-glow */}
      <motion.div
        className="absolute left-1/2 top-1/3 h-[110%] w-[55%] -translate-x-1/2 origin-top rounded-[50%] bg-[radial-gradient(closest-side,_hsl(var(--primary)/0.35),_transparent_75%)] blur-2xl"
        animate={{ opacity: [0.55, 0.8, 0.55] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Bokeh / stage lights — denser since we no longer have a photo */}
      <div
        className="absolute inset-0 opacity-80"
        style={{
          backgroundImage: [
            'radial-gradient(8px 8px at 12% 78%, rgba(255, 220, 180, 0.55), transparent 60%)',
            'radial-gradient(6px 6px at 22% 88%, rgba(255, 180, 220, 0.45), transparent 60%)',
            'radial-gradient(10px 10px at 78% 70%, rgba(180, 200, 255, 0.42), transparent 60%)',
            'radial-gradient(5px 5px at 88% 84%, rgba(255, 220, 180, 0.50), transparent 60%)',
            'radial-gradient(4px 4px at 60% 92%, rgba(255, 255, 255, 0.45), transparent 60%)',
            'radial-gradient(7px 7px at 38% 82%, rgba(220, 180, 255, 0.45), transparent 60%)',
            'radial-gradient(5px 5px at 8% 66%, rgba(255, 200, 240, 0.40), transparent 60%)',
            'radial-gradient(6px 6px at 95% 58%, rgba(255, 220, 200, 0.35), transparent 60%)',
            'radial-gradient(3px 3px at 50% 70%, rgba(255, 255, 255, 0.40), transparent 60%)',
            'radial-gradient(4px 4px at 30% 72%, rgba(255, 200, 220, 0.38), transparent 60%)',
            'radial-gradient(5px 5px at 70% 86%, rgba(220, 220, 255, 0.40), transparent 60%)',
          ].join(', '),
          filter: 'blur(0.5px)',
        }}
      />

      {/* Film grain — adds cinematic texture, hides any gradient banding */}
      <div
        className="absolute inset-0 opacity-[0.18] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>"
          )}")`,
          backgroundSize: '220px 220px',
        }}
      />

      {/* Soft animated purple orb (atmosphere, not technical) */}
      <motion.div
        className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-primary/25 blur-3xl"
        animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-48 right-[-6rem] h-[34rem] w-[34rem] rounded-full bg-fuchsia-500/15 blur-3xl"
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Drifting glow particles — ambient motion, lightweight (no library) */}
      <motion.div
        aria-hidden
        className="absolute left-[18%] top-[55%] h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_12px_4px_rgba(255,255,255,0.35)]"
        animate={{ y: [-8, -36, -8], opacity: [0.6, 0.95, 0.6] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="absolute left-[68%] top-[72%] h-1 w-1 rounded-full bg-pink-200/80 shadow-[0_0_10px_3px_rgba(255,180,210,0.4)]"
        animate={{ y: [-4, -30, -4], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />
      <motion.div
        aria-hidden
        className="absolute left-[42%] top-[80%] h-1 w-1 rounded-full bg-primary/90 shadow-[0_0_10px_3px_hsl(var(--primary)/0.5)]"
        animate={{ y: [-6, -28, -6], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
      />

      {/* Section seam — fades hero into the next dark section so the page reads as one continuous canvas */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent via-[#07051a]/85 to-[#07051a]" />
    </div>
  );
}

function HeroCopy() {
  return (
    <div className="lg:col-span-7 relative z-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-xs sm:text-sm text-white/80 backdrop-blur"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/70" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        <span>Caribbean&rsquo;s premier ticketing experience</span>
      </motion.div>

      <motion.h1
        id="hero-heading"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="mt-4 sm:mt-6 text-[2.375rem] leading-[1.04] sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-balance"
      >
        The <AccentWord>Caribbean&rsquo;s</AccentWord> next
        <br className="sm:hidden" />{' '}
        <AccentWord>unforgettable</AccentWord> night
        <br className="sm:hidden" /> starts here.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="mt-3.5 sm:mt-5 max-w-xl text-[15px] sm:text-lg lg:text-xl text-white/65 sm:text-white/70 leading-[1.5] sm:leading-relaxed"
      >
        Discover the events everyone will talk about tomorrow. Buy tickets in
        seconds and share the experience with your people.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.35 }}
        className="mt-5 sm:mt-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-3">
          <Button
            asChild
            size="lg"
            className="h-12 sm:h-12 w-full sm:w-auto px-7 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_20px_60px_-15px_hsl(var(--primary)/0.7)]"
          >
            <Link href="/events" className="inline-flex items-center gap-2">
              Explore Events
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>

          {/* Desktop secondary CTA — outlined button */}
          <Button
            asChild
            size="lg"
            variant="outline"
            className="hidden sm:inline-flex h-12 px-7 text-base font-semibold border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white backdrop-blur"
          >
            <Link href="/organizer/events/new">Create an Event</Link>
          </Button>

          {/* Mobile secondary CTA — supporting link, intentionally quiet */}
          <Link
            href="/organizer/events/new"
            className="sm:hidden inline-flex items-center justify-center gap-1 text-[13px] text-white/50 hover:text-white/80 transition-colors py-0.5"
          >
            Hosting something? Create an event
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

function AccentWord({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-gradient-to-r from-primary via-fuchsia-400 to-primary bg-clip-text text-transparent">
      {children}
    </span>
  );
}

function HeroVisuals() {
  return (
    <div className="lg:col-span-5 relative">
      {/* Stage glow behind the cards — gives the featured event card a sense of being lit */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 mx-auto max-w-[520px] blur-3xl"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 35%, hsl(var(--primary) / 0.35), transparent 70%)',
        }}
      />

      <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[380px] lg:max-w-[400px] pb-28 sm:pb-32">
        {/* Featured event — the centerpiece. Slight grounded tilt. */}
        <motion.div
          initial={{ opacity: 0, y: 24, rotate: -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: -1.5 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative origin-top"
        >
          <FloatingWrapper offset={-6}>
            <FeaturedEventCard />
          </FloatingWrapper>
        </motion.div>

        {/* Ticket confirmation — kisses the bottom-right corner of the event card.
            Sits mostly below the featured card so it never blocks the price or CTA. */}
        <motion.div
          initial={{ opacity: 0, y: 24, rotate: 3 }}
          animate={{ opacity: 1, y: 0, rotate: 3 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="absolute right-[-4px] sm:right-[-12px] bottom-0 w-[62%] sm:w-[58%] max-w-[240px]"
        >
          <FloatingWrapper offset={8} delay={1.4}>
            <TicketConfirmationCard />
          </FloatingWrapper>
        </motion.div>
      </div>
    </div>
  );
}

function FloatingWrapper({
  children,
  offset = 6,
  delay = 0,
}: {
  children: React.ReactNode;
  offset?: number;
  delay?: number;
}) {
  return (
    <motion.div
      animate={{ y: [0, offset, 0] }}
      transition={{
        duration: 6,
        repeat: Infinity,
        ease: 'easeInOut',
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}

function FeaturedEventCard() {
  return (
    <article className="rounded-[20px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-xl shadow-[0_40px_100px_-30px_rgba(0,0,0,0.85)] overflow-hidden ring-1 ring-white/5">
      {/* Image area — taller, dominant. Image fills more of the card now. */}
      <div className="relative aspect-[5/4] w-full">
        <Image
          src={FEATURED_EVENT_IMAGE}
          alt="Sunset Fete — crowd at golden hour on the Kingston waterfront"
          fill
          sizes="(min-width: 1024px) 400px, 90vw"
          className="object-cover"
        />
        {/* Painterly fallback in case image is missing — readable on its own */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage: [
              'radial-gradient(60% 80% at 50% 100%, rgba(255, 140, 90, 0.55), transparent 60%)',
              'radial-gradient(80% 60% at 50% 0%, rgba(120, 80, 200, 0.55), transparent 65%)',
              'linear-gradient(180deg, #1a0f33 0%, #2a1140 60%, #401528 100%)',
            ].join(', '),
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/35 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_hsl(var(--primary)/0.30),_transparent_55%)]" />

        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground shadow-lg shadow-primary/30">
            <Sparkles className="h-3 w-3" aria-hidden />
            Featured
          </span>
          <SellingFastPill />
        </div>

        {/* Title block sits in the bottom gradient — date/time and viewers added for live feel */}
        <div className="absolute bottom-3 left-4 right-4 space-y-2">
          <div>
            <h3 className="text-[1.35rem] font-bold leading-tight tracking-tight">
              Sunset Fete
            </h3>
            <p className="text-[11px] text-white/75 mt-1 inline-flex items-center gap-1.5">
              <MapPin className="h-3 w-3" aria-hidden />
              Kingston, Jamaica
              <span className="mx-1.5 h-0.5 w-0.5 rounded-full bg-white/30" />
              <Calendar className="h-3 w-3" aria-hidden />
              Sat · 9PM
            </p>
          </div>

          {/* Live viewers — subtle, app-like activity signal */}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2 py-0.5 text-[10px] text-white/85 backdrop-blur ring-1 ring-white/10">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            <span className="tabular-nums">92 viewing now</span>
          </div>
        </div>
      </div>

      {/* Compact action footer — image dominates, copy stays minimal */}
      <div className="px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between gap-3 border-t border-white/[0.06]">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-white/45">
            From
          </p>
          <p className="text-[15px] font-semibold text-white tabular-nums leading-tight">
            J$3,500
          </p>
        </div>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-white/55">
            <Users className="h-3 w-3" aria-hidden />
            <span className="tabular-nums">1.2k going</span>
          </span>
          <Button
            asChild
            size="sm"
            className="shrink-0 h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.7)]"
          >
            <Link href="/events" aria-label="Get tickets for Sunset Fete">
              Get Tickets
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function SellingFastPill() {
  return (
    <motion.span
      animate={{ boxShadow: [
        '0 0 0 0 rgba(52,211,153,0.0)',
        '0 0 0 6px rgba(52,211,153,0.0)',
        '0 0 0 0 rgba(52,211,153,0.0)',
      ] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur ring-1 ring-white/10"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      Selling fast
    </motion.span>
  );
}

function TicketConfirmationCard() {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900/90 backdrop-blur-xl p-4 shadow-[0_30px_80px_-25px_rgba(0,0,0,0.9)] ring-1 ring-white/5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Ticket Confirmed</p>
          <p className="text-[11px] text-white/55">General Admission · 2 tickets</p>
        </div>
        <Ticket className="ml-auto h-4 w-4 text-white/40" aria-hidden />
      </div>

      <div className="mt-3.5 flex items-center gap-3 rounded-xl bg-white/[0.04] p-3 border border-white/10">
        <QRPlaceholder />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/50">
            Order #TT-4192
          </p>
          <p className="text-sm font-medium text-white truncate">Sunset Fete</p>
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            <Wallet className="h-3 w-3" aria-hidden />
            Add to Wallet
          </button>
        </div>
      </div>
    </article>
  );
}

function QRPlaceholder() {
  return (
    <div
      role="img"
      aria-label="Ticket QR code"
      className="grid h-14 w-14 shrink-0 grid-cols-6 grid-rows-6 gap-[2px] rounded-md bg-white p-1.5"
    >
      {QR_PATTERN.map((on, i) => (
        <span
          key={i}
          className={on ? 'bg-slate-900 rounded-[1px]' : 'bg-transparent'}
        />
      ))}
    </div>
  );
}

// Static 6x6 mask that reads as a QR thumbnail — purely decorative.
const QR_PATTERN = [
  1, 1, 1, 0, 1, 1,
  1, 0, 1, 1, 0, 1,
  1, 1, 0, 1, 1, 1,
  0, 1, 1, 0, 1, 0,
  1, 0, 1, 1, 0, 1,
  1, 1, 0, 1, 1, 1,
];

function StatsRow() {
  const stats: { value: string; label: string; icon: typeof Users }[] = [
    { value: '25K+', label: 'Happy attendees', icon: Users },
    { value: '1.2K+', label: 'Tickets sold', icon: Ticket },
    { value: '12+', label: 'Islands & cities', icon: MapPin },
    { value: 'Trusted', label: 'by top organizers', icon: Sparkles },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.5 }}
      className="mt-10 sm:mt-12 lg:mt-10"
    >
      <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(70% 100% at 50% 0%, hsl(var(--primary) / 0.18), transparent 70%)',
          }}
        />
        <ul className="relative grid grid-cols-2 lg:grid-cols-4 divide-y divide-white/[0.06] lg:divide-y-0 lg:divide-x lg:divide-white/[0.06]">
          {stats.map((s) => (
            <li
              key={s.label}
              className="flex items-center gap-3 px-4 sm:px-6 py-4 sm:py-4"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                <s.icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <span className="block text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-white tabular-nums leading-none">
                  {s.value}
                </span>
                <span className="mt-1 block text-[11px] sm:text-xs lg:text-[13px] text-white/45 leading-snug">
                  {s.label}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
