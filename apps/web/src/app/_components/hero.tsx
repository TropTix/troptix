'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

const FEATURED_EVENT_IMAGE = '/images/events/sunset1.png';

export default function LandingHero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden bg-[#faf8f4] text-slate-900 -mt-16 pt-16"
    >
      <HeroBackground />

      <div className="relative z-10 container mx-auto px-5 sm:px-6 lg:px-8 pt-6 pb-12 sm:pt-12 sm:pb-16 lg:pt-16 lg:pb-20">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-14 items-center">
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
      {/* Soft warm canvas — gentle cream gradient, no vignette, no dark base */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            // Whisper-soft lavender wash upper-left (brand presence, not brand glow)
            'radial-gradient(55% 45% at 12% 8%, hsl(var(--primary) / 0.10), transparent 65%)',
            // Warm peach hint at lower-right (sunset implication, very subtle)
            'radial-gradient(60% 50% at 92% 95%, rgba(255, 200, 170, 0.30), transparent 65%)',
            // Base — warm cream gradient, top-to-bottom
            'linear-gradient(180deg, #fbfaf6 0%, #faf8f4 55%, #f4f0e8 100%)',
          ].join(', '),
        }}
      />

      {/* Single quiet orb — barely-there ambient atmosphere */}
      <motion.div
        className="absolute -top-40 -left-32 h-[32rem] w-[32rem] rounded-full bg-primary/[0.06] blur-3xl"
        animate={{ opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Faint editorial grain — premium print-paper texture */}
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-multiply"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>"
          )}")`,
          backgroundSize: '220px 220px',
        }}
      />
    </div>
  );
}

function HeroCopy() {
  return (
    <div className="lg:col-span-7 relative z-10">
      {/* Editorial eyebrow — discreet, premium */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="inline-flex items-center gap-2 text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500"
      >
        <span className="h-px w-6 bg-slate-300" />
        Caribbean Experiences
      </motion.div>

      <motion.h1
        id="hero-heading"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="mt-4 sm:mt-5 text-[2.375rem] leading-[1.04] sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-slate-900 text-balance"
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
        className="mt-4 sm:mt-6 max-w-[34ch] text-[15px] sm:text-lg lg:text-xl text-slate-600 leading-[1.5] sm:leading-[1.45]"
      >
        Discover the experiences everyone will talk about tomorrow. Curated for
        the Caribbean.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.35 }}
        className="mt-6 sm:mt-9"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-3">
          <Button
            asChild
            size="lg"
            className="h-12 w-full sm:w-auto px-7 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_10px_28px_-12px_hsl(var(--primary)/0.45)]"
          >
            <Link href="/events" className="inline-flex items-center gap-2">
              Explore Events
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </Button>

          {/* Desktop secondary CTA — refined link button */}
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="hidden sm:inline-flex h-12 px-5 text-base font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-900/[0.04]"
          >
            <Link
              href="/organizer/events/new"
              className="inline-flex items-center gap-1.5"
            >
              Create an event
              <ArrowRight className="h-4 w-4 text-slate-500" aria-hidden />
            </Link>
          </Button>

          {/* Mobile secondary CTA — supporting link */}
          <Link
            href="/organizer/events/new"
            className="sm:hidden inline-flex items-center justify-center gap-1 text-[13px] text-slate-500 hover:text-slate-800 transition-colors py-0.5"
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
      <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[380px] lg:max-w-[420px]">
        {/* Featured poster — the single visual centerpiece */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2 }}
        >
          <FloatingWrapper offset={-5}>
            <FeaturedEventCard />
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
    <motion.article
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      className="group relative rounded-[26px] overflow-hidden shadow-[0_30px_70px_-25px_rgba(15,23,42,0.30),0_8px_20px_-8px_rgba(15,23,42,0.10)] ring-1 ring-slate-900/[0.05]"
    >
      <div className="relative aspect-[4/5] w-full">
        <Image
          src={FEATURED_EVENT_IMAGE}
          alt="Sunset Fete — Kingston, Jamaica"
          fill
          sizes="(min-width: 1024px) 440px, 90vw"
          className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.03]"
        />

        {/* Warm sunset painterly fallback (only seen if image is missing) */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            backgroundImage: [
              'radial-gradient(70% 60% at 50% 100%, rgba(255, 150, 110, 0.7), transparent 65%)',
              'radial-gradient(80% 60% at 30% 0%, rgba(180, 130, 200, 0.5), transparent 65%)',
              'linear-gradient(180deg, #2a1f3d 0%, #4a2845 55%, #6b3a3a 100%)',
            ].join(', '),
          }}
        />

        {/* Just enough bottom gradient for metadata legibility — kept restrained */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/10 to-transparent" />

        {/* Live signal — tiny dot + label, no pill chrome */}
        <div className="absolute top-4 right-4 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-300/70" />
            <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Selling fast
        </div>

        {/* Editorial metadata — floats on the artwork, no chrome */}
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 text-white">
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/55 font-medium">
            Featured
          </p>
          <h3 className="mt-2 text-[1.65rem] sm:text-[1.85rem] font-semibold leading-[1.05] tracking-tight">
            Sunset Fete
          </h3>
          <p className="mt-1.5 text-[12px] text-white/70 inline-flex items-center gap-1.5">
            Kingston, Jamaica
            <span className="mx-1 h-0.5 w-0.5 rounded-full bg-white/40" />
            Sat · 9PM
          </p>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div className="leading-tight">
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/45">
                From
              </p>
              <p className="text-[15px] font-semibold text-white tabular-nums mt-0.5">
                J$3,500
              </p>
            </div>
            <Link
              href="/events"
              aria-label="Get tickets for Sunset Fete"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur ring-1 ring-white/25 px-3.5 py-2 text-xs font-medium text-white hover:bg-white/25 transition-colors"
            >
              Get tickets
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

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
      className="mt-14 sm:mt-16 lg:mt-16 border-t border-slate-900/[0.07] pt-8 sm:pt-9"
    >
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-y-7 gap-x-4 sm:gap-x-8">
        {stats.map((s) => (
          <li key={s.label} className="flex flex-col gap-1.5">
            <span className="text-2xl sm:text-3xl lg:text-[2rem] font-semibold tracking-tight text-slate-900 tabular-nums leading-none">
              {s.value}
            </span>
            <span className="text-[11px] sm:text-xs lg:text-[13px] text-slate-500 leading-snug">
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
