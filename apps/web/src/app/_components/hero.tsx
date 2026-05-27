'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, MapPin, Wallet } from 'lucide-react';

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
      {/* Deep navy night sky — one focal bloom, one faint warm ember, nothing else loud */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            // Single primary bloom, upper-left — the only "brand" light source
            'radial-gradient(55% 50% at 18% 10%, hsl(var(--primary) / 0.28), transparent 65%)',
            // Faint warm ember low and centered — implies a horizon without naming it
            'radial-gradient(75% 45% at 50% 115%, rgba(170, 90, 110, 0.18), transparent 65%)',
            // Base — deeper, calmer indigo
            'linear-gradient(180deg, #08071f 0%, #07061c 50%, #050418 100%)',
          ].join(', '),
        }}
      />

      {/* Soft vignette — pulls eye to center without a hard edge */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_45%,_transparent_55%,_rgba(3,2,12,0.7)_100%)]" />

      {/* Film grain — keeps gradients from banding, adds cinematic texture */}
      <div
        className="absolute inset-0 opacity-[0.1] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>"
          )}")`,
          backgroundSize: '220px 220px',
        }}
      />

      {/* Single slow orb — quiet ambient motion */}
      <motion.div
        className="absolute -top-40 -left-32 h-[32rem] w-[32rem] rounded-full bg-primary/[0.12] blur-3xl"
        animate={{ opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Section seam — fades hero into the next dark section as one canvas */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent via-[#07051a]/85 to-[#07051a]" />
    </div>
  );
}

function HeroCopy() {
  return (
    <div className="lg:col-span-7 relative z-10">
      {/* <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] sm:text-xs text-white/65"
      >
        <span className="h-1 w-1 rounded-full bg-primary/80" />
        <span>Now in Beta</span>
      </motion.div> */}

      <motion.h1
        id="hero-heading"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="mt-4 sm:mt-6 text-[2.375rem] leading-[1.04] sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-balance"
      >
        Your next
        <br className="sm:hidden" /> <AccentWord>unforgettable</AccentWord>{' '}
        experience
        <br className="sm:hidden" /> starts here.
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="mt-3.5 sm:mt-5 max-w-xl text-[15px] sm:text-lg lg:text-xl text-white/65 sm:text-white/70 leading-[1.5] sm:leading-relaxed"
      >
        Create, manage and discover the events everyone will talk about
        tomorrow. Built and designed for the Caribbean.
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
            className="h-12 w-full sm:w-auto px-7 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_10px_30px_-15px_hsl(var(--primary)/0.5)]"
          >
            <Link href="/events" className="inline-flex items-center gap-2">
              Explore Events
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>

          {/* Desktop secondary CTA — quieter, ghost-style */}
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="hidden sm:inline-flex h-12 px-5 text-base font-medium text-white/70 hover:text-white hover:bg-white/[0.04]"
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
  return <span className="text-primary">{children}</span>;
}

function HeroVisuals() {
  return (
    <div className="lg:col-span-5 relative">
      {/* Faint glow behind the cards — barely there, just lifts them off the canvas */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 mx-auto max-w-[480px] blur-3xl"
        style={{
          background:
            'radial-gradient(50% 50% at 50% 40%, hsl(var(--primary) / 0.16), transparent 75%)',
        }}
      />

      <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[380px] lg:max-w-[400px] pb-28 sm:pb-32">
        {/* Featured event — anchored, almost no tilt */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative"
        >
          <FloatingWrapper offset={-4}>
            <FeaturedEventCard />
          </FloatingWrapper>
        </motion.div>

        {/* Ticket confirmation — light tilt, calm float, never overlaps price/CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20, rotate: 1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 1.5 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="absolute right-[-4px] sm:right-[-12px] bottom-0 w-[62%] sm:w-[58%] max-w-[240px]"
        >
          <FloatingWrapper offset={6} delay={1.4}>
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
    <article className="rounded-[20px] border border-white/[0.07] bg-white/[0.025] backdrop-blur-xl shadow-[0_20px_60px_-25px_rgba(0,0,0,0.6)] overflow-hidden">
      {/* Image area — photography leads. Minimal overlays. */}
      <div className="relative aspect-[5/4] w-full">
        <Image
          src={FEATURED_EVENT_IMAGE}
          alt="Sunset Fete — Kingston, Jamaica"
          fill
          sizes="(min-width: 1024px) 400px, 90vw"
          className="object-cover"
        />
        {/* Painterly fallback (only seen when image is missing) — quieter palette */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage: [
              'radial-gradient(70% 70% at 50% 100%, rgba(120, 50, 80, 0.45), transparent 65%)',
              'radial-gradient(80% 60% at 30% 0%, rgba(70, 50, 130, 0.45), transparent 65%)',
              'linear-gradient(180deg, #14102a 0%, #1c1234 60%, #2b1126 100%)',
            ].join(', '),
          }}
        />
        {/* Single bottom-gradient for title readability — no extra primary wash */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent" />

        {/* Single quiet pill — "Selling fast" only. No "Featured", no "92 viewing", no purple chip. */}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/85 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Selling fast
        </span>

        <div className="absolute bottom-3 left-4 right-4">
          <h3 className="text-[1.35rem] font-semibold leading-tight tracking-tight">
            Sunset Fete
          </h3>
          <p className="text-[11px] text-white/65 mt-1 inline-flex items-center gap-1.5">
            <MapPin className="h-3 w-3" aria-hidden />
            Kingston, Jamaica
            <span className="mx-1 h-0.5 w-0.5 rounded-full bg-white/25" />
            Sat · 9PM
          </p>
        </div>
      </div>

      {/* Quiet action footer — no top border, no shadow on button */}
      <div className="px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-white/40">
            From
          </p>
          <p className="text-[15px] font-semibold text-white tabular-nums leading-tight">
            J$3,500
          </p>
        </div>
        <Button
          asChild
          size="sm"
          className="shrink-0 h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
        >
          <Link href="/events" aria-label="Get tickets for Sunset Fete">
            Get Tickets
          </Link>
        </Button>
      </div>
    </article>
  );
}

function TicketConfirmationCard() {
  return (
    <article className="rounded-2xl border border-white/[0.07] bg-slate-900/80 backdrop-blur-xl p-3.5 shadow-[0_15px_40px_-15px_rgba(0,0,0,0.55)]">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-white leading-tight">
            Ticket Confirmed
          </p>
          <p className="text-[11px] text-white/45 leading-tight mt-0.5">
            General Admission
          </p>
        </div>
      </div>

      {/* Flattened: no inner panel, no border. QR + label sit on the same surface. */}
      <div className="mt-3 flex items-center gap-3">
        <QRPlaceholder />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/40">
            Order #TT-4192
          </p>
          <p className="text-[13px] font-medium text-white truncate leading-tight mt-0.5">
            Sunset Fete
          </p>
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
  1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0,
  1, 1, 0, 1, 1, 1, 0, 1, 1, 1,
];

function StatsRow() {
  const stats = [
    { value: '25K+', label: 'Happy attendees' },
    { value: '1.2K+', label: 'Tickets sold' },
    { value: '12+', label: 'Islands & cities' },
    { value: 'Trusted', label: 'by top organizers' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.5 }}
      className="mt-12 sm:mt-14 lg:mt-12 border-t border-white/[0.06] pt-7 sm:pt-8"
    >
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-y-6 gap-x-4 sm:gap-x-8">
        {stats.map((s) => (
          <li key={s.label} className="flex flex-col gap-1">
            <span className="text-2xl sm:text-3xl lg:text-[2rem] font-semibold tracking-tight text-white tabular-nums leading-none">
              {s.value}
            </span>
            <span className="text-[11px] sm:text-xs lg:text-[13px] text-white/40 leading-snug">
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
