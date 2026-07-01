'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from 'motion/react';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const FEATURED_EVENT_IMAGE = '/images/events/sunset-flyer.webp';

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
          <HeroPosterScene />
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
            // Warm sunset glow at lower-right, slightly stronger to feed the scene
            'radial-gradient(65% 55% at 92% 92%, rgba(255, 190, 150, 0.38), transparent 65%)',
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
        className="mt-4 sm:mt-5 text-[clamp(2.625rem,11vw,3.25rem)] leading-[1.05] sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-slate-900 text-balance"
      >
        Your next <br className="sm:hidden" />
        <AccentWord>unforgettable</AccentWord> <br className="sm:hidden" />
        experience <br className="sm:hidden" />
        starts here.
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
            <Link href="/discover" className="inline-flex items-center gap-2">
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

/* ------------------------------------------------------------------ */
/* Layered poster scene — the cinematic, dimensional centerpiece       */
/* ------------------------------------------------------------------ */

const PARALLAX_SPRING = { stiffness: 60, damping: 18, mass: 0.4 };

/** Subscribe to a media query without tripping set-state-in-effect; SSR-safe. */
function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

function HeroPosterScene() {
  const prefersReduced = useReducedMotion() ?? false;
  // Parallax is desktop + fine-pointer only, and disabled for reduced motion.
  const canParallax = useMediaQuery(
    '(hover: hover) and (pointer: fine) and (min-width: 1024px)'
  );
  const parallaxOn = canParallax && !prefersReduced;

  // Normalized pointer offset (-0.5 … 0.5), spring-smoothed for premium ease.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const sx = useSpring(pointerX, PARALLAX_SPRING);
  const sy = useSpring(pointerY, PARALLAX_SPRING);

  // Poster gets a gentle translate + 3D tilt that tracks the cursor.
  const posterX = useTransform(sx, (v) => v * 14);
  const posterY = useTransform(sy, (v) => v * 14);
  const rotateY = useTransform(sx, (v) => v * 7);
  const rotateX = useTransform(sy, (v) => v * -7);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!parallaxOn) return;
    const r = e.currentTarget.getBoundingClientRect();
    pointerX.set((e.clientX - r.left) / r.width - 0.5);
    pointerY.set((e.clientY - r.top) / r.height - 0.5);
  };

  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  return (
    <div
      className="lg:col-span-5 relative"
      onMouseMove={handleMouseMove}
      onMouseLeave={resetPointer}
    >
      <div className="relative isolate mx-auto w-full max-w-[340px] sm:max-w-[380px] lg:max-w-[440px] [perspective:1200px]">
        {/* Atmospheric gradient blobs — behind everything */}
        <div aria-hidden className="absolute -inset-10 z-0">
          <div
            className="absolute left-[-6%] top-[2%] h-44 w-44 rounded-full blur-3xl"
            style={{
              background:
                'radial-gradient(circle, hsl(var(--primary) / 0.28), transparent 70%)',
            }}
          />
          <div
            className="absolute right-[-8%] bottom-[2%] h-56 w-56 rounded-full blur-3xl"
            style={{
              background:
                'radial-gradient(circle, rgba(255, 170, 120, 0.45), transparent 70%)',
            }}
          />
        </div>

        {/* The poster — the experience itself */}
        <motion.div
          className="relative z-10 will-change-transform"
          style={{
            x: posterX,
            y: posterY,
            rotateX,
            rotateY,
            transformPerspective: 1200,
          }}
        >
          <FloatingWrapper offset={-5} disabled={prefersReduced}>
            <FeaturedEventCard />
          </FloatingWrapper>
        </motion.div>

        {/* Floating orb — escapes the top-right, sits in front for depth */}
        <FloatingObject
          px={sx}
          py={sy}
          depth={44}
          reduceMotion={prefersReduced}
          drift={{ y: -14, x: 4, duration: 10 }}
          className="-right-4 top-8 sm:-right-6 sm:top-10 z-20 pointer-events-none"
        >
          <Orb className="h-16 w-16 sm:h-20 sm:w-20 lg:h-24 lg:w-24" />
        </FloatingObject>

        {/* Sparkles — front layer, desktop/tablet only */}
        <FloatingObject
          px={sx}
          py={sy}
          depth={36}
          reduceMotion={prefersReduced}
          drift={{ y: -10, rotate: 8, duration: 8 }}
          className="hidden sm:block left-[-7%] top-[26%] z-20 pointer-events-none"
        >
          <Sparkle className="h-6 w-6 text-white drop-shadow-[0_2px_10px_rgba(255,255,255,0.6)]" />
        </FloatingObject>
        <FloatingObject
          px={sx}
          py={sy}
          depth={30}
          reduceMotion={prefersReduced}
          drift={{ y: -8, rotate: -10, duration: 9, delay: 1.5 }}
          className="hidden sm:block right-[12%] bottom-[16%] z-20 pointer-events-none"
        >
          <Sparkle className="h-4 w-4 text-primary/80 drop-shadow-[0_2px_10px_hsl(var(--primary)/0.55)]" />
        </FloatingObject>

        {/* Ticket-confirmed chip — escapes the top-left, balances the orb */}
        <FloatingObject
          px={sx}
          py={sy}
          depth={40}
          reduceMotion={prefersReduced}
          drift={{ y: -8, duration: 11, delay: 0.6 }}
          className="left-[-10px] top-[13%] sm:-left-4 z-20 pointer-events-none"
        >
          <TicketConfirmedChip reduceMotion={prefersReduced} />
        </FloatingObject>
      </div>
    </div>
  );
}

/**
 * A decorative element that combines:
 *  - cursor parallax (translate scaled by `depth`, in px), and
 *  - a slow ambient drift loop (`drift`).
 * Positioning + sizing come from `className`. Always decorative (aria-hidden).
 */
function FloatingObject({
  children,
  className,
  depth = 1,
  drift,
  px,
  py,
  reduceMotion = false,
}: {
  children: React.ReactNode;
  className?: string;
  depth?: number;
  drift?: {
    x?: number;
    y?: number;
    rotate?: number;
    duration?: number;
    delay?: number;
  };
  px: MotionValue<number>;
  py: MotionValue<number>;
  reduceMotion?: boolean;
}) {
  const tx = useTransform(px, (v) => v * depth);
  const ty = useTransform(py, (v) => v * depth);

  return (
    <motion.div
      aria-hidden
      className={cn('absolute will-change-transform', className)}
      style={{ x: tx, y: ty }}
    >
      <motion.div
        animate={
          reduceMotion
            ? undefined
            : {
                y: [0, drift?.y ?? -10, 0],
                x: [0, drift?.x ?? 0, 0],
                rotate: [0, drift?.rotate ?? 0, 0],
              }
        }
        transition={
          reduceMotion
            ? undefined
            : {
                duration: drift?.duration ?? 9,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: drift?.delay ?? 0,
              }
        }
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function FloatingWrapper({
  children,
  offset = 6,
  delay = 0,
  disabled = false,
}: {
  children: React.ReactNode;
  offset?: number;
  delay?: number;
  disabled?: boolean;
}) {
  return (
    <motion.div
      animate={disabled ? undefined : { y: [0, offset, 0] }}
      transition={
        disabled
          ? undefined
          : { duration: 6, repeat: Infinity, ease: 'easeInOut', delay }
      }
    >
      {children}
    </motion.div>
  );
}

/* --- Decorative primitives ---------------------------------------- */

/** Warm sunset orb — coral→magenta gradient that echoes the hero's sunset glow. */
function Orb({ className }: { className?: string }) {
  return (
    <div
      className={cn('relative rounded-full', className)}
      style={{
        background:
          'radial-gradient(circle at 32% 26%, #ffffff 0%, #ffe2c0 16%, #ff9d6e 48%, #ec4a7d 100%)',
        boxShadow:
          '0 22px 44px -12px rgba(236,74,125,0.40), inset 0 -10px 20px rgba(150,40,80,0.45), inset 0 8px 14px rgba(255,255,255,0.55)',
      }}
    >
      <span className="absolute left-[22%] top-[15%] h-1/4 w-1/4 rounded-full bg-white/80 blur-[5px]" />
    </div>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M12 0c.6 7 4.4 10.9 12 12-7.6 1.1-11.4 5-12 12-.6-7-4.4-10.9-12-12C7.6 10.9 11.4 7 12 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Decorative QR thumbnail mask (purely illustrative).
const MINI_QR = [
  1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0,
  1, 1, 0, 1, 1, 1, 0, 1, 1, 1,
];

function MiniQR() {
  return (
    <div
      role="img"
      aria-label="Ticket QR code"
      className="grid h-11 w-11 shrink-0 grid-cols-6 grid-rows-6 gap-[2px] rounded-md bg-white ring-1 ring-slate-900/[0.06] p-1"
    >
      {MINI_QR.map((on, i) => (
        <span
          key={i}
          className={on ? 'rounded-[1px] bg-slate-900' : 'bg-transparent'}
        />
      ))}
    </div>
  );
}

/**
 * Small light card that floats over the poster and auto-plays a buy flow once
 * on view: "Get ticket" → tap → confirmed → QR reveal. `reduceMotion` jumps
 * straight to the final confirmed+QR state with no animation.
 * Decorative illustration only (the parent FloatingObject is aria-hidden).
 */
function TicketConfirmedChip({
  reduceMotion = false,
}: {
  reduceMotion?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  // 0 = button, 1 = tapped, 2 = confirmed, 3 = QR revealed
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduceMotion || !inView) return;
    const timers = [
      setTimeout(() => setStep(1), 800),
      setTimeout(() => setStep(2), 1250),
      setTimeout(() => setStep(3), 1950),
    ];
    return () => timers.forEach(clearTimeout);
  }, [inView, reduceMotion]);

  // Reduced motion (incl. when resolved post-hydration) jumps to the final state.
  const activeStep = reduceMotion ? 3 : step;
  const confirmed = activeStep >= 2;

  return (
    <motion.div
      ref={ref}
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.94 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="w-[184px] rounded-2xl bg-white/90 backdrop-blur ring-1 ring-slate-900/[0.06] shadow-[0_12px_30px_-12px_rgba(15,23,42,0.22)] p-2.5"
    >
      <AnimatePresence mode="wait" initial={false}>
        {!confirmed ? (
          <motion.div
            key="buy"
            layout
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative"
          >
            {/* Faux "Get ticket" button (not a real control — parent is aria-hidden) */}
            <motion.div
              animate={step === 1 ? { scale: 0.95 } : { scale: 1 }}
              transition={{ duration: 0.16 }}
              className="relative flex items-center justify-center rounded-xl bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground"
            >
              Get ticket
              {step === 1 && !reduceMotion && (
                <motion.span
                  className="absolute inset-0 rounded-xl ring-2 ring-primary/40"
                  initial={{ opacity: 0.6, scale: 0.92 }}
                  animate={{ opacity: 0, scale: 1.25 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              )}
            </motion.div>
            {/* Tap cursor */}
            {step === 1 && !reduceMotion && (
              <motion.span
                className="absolute -bottom-1 right-3 h-3 w-3 rounded-full bg-slate-900/70 ring-2 ring-white"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1, 0.85, 1], opacity: 1 }}
                transition={{ duration: 0.4 }}
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="done"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="space-y-2.5"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  aria-hidden
                >
                  <motion.path
                    d="M5 13l4 4L19 7"
                    stroke="#059669"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    animate={reduceMotion ? undefined : { pathLength: 1 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  />
                </svg>
              </span>
              <div className="leading-tight">
                <p className="text-[12px] font-semibold text-slate-900">
                  Ticket confirmed
                </p>
                <p className="text-[10px] text-slate-500">General Admission</p>
              </div>
            </div>

            {activeStep >= 3 && (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
                animate={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="flex items-center gap-2.5 rounded-xl bg-slate-50 ring-1 ring-slate-900/[0.05] p-2"
              >
                <MiniQR />
                <div className="leading-tight">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-slate-400">
                    Order #TT-4192
                  </p>
                  <p className="text-[11px] font-medium text-slate-900">
                    Sunset Fete
                  </p>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
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
          priority
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
            <span className="absolute inset-0 animate-ping motion-reduce:animate-none rounded-full bg-emerald-300/70" />
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

          <div className="mt-4 leading-tight">
            <p className="text-[9px] uppercase tracking-[0.16em] text-white/45">
              From
            </p>
            <p className="text-[15px] font-semibold text-white tabular-nums mt-0.5">
              J$3,500
            </p>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function StatsRow() {
  const stats = [
    { value: '1.8K+', label: 'Happy attendees' },
    { value: '1K+', label: 'Tickets sold' },
    { value: '7+', label: 'Events created' },
    { value: 'Trusted', label: 'by organizers' },
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
