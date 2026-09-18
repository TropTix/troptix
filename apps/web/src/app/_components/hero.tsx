'use client';

import { useEffect, useState } from 'react';
import { Bricolage_Grotesque } from 'next/font/google';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  ArtWineFlyer,
  BandLaunchFlyer,
  BeachFeteFlyer,
  DominoNightFlyer,
  FlyerFrame,
  JouvertFlyer,
  ReggaeNightFlyer,
  SocaBrunchFlyer,
  SunsetCruiseFlyer,
} from './flyers';

const displayFont = Bricolage_Grotesque({ subsets: ['latin'] });

export default function LandingHero() {
  const prefersReduced = useReducedMotion() ?? false;

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate overflow-hidden bg-background -mt-16"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            'radial-gradient(60% 40% at 50% 0%, color-mix(in srgb, var(--primary) 7%, transparent), transparent 70%)',
        }}
      />

      <div className="relative flex min-h-svh flex-col items-center justify-center px-5 pt-24 pb-10 sm:pt-28 lg:min-h-[min(100svh,56rem)]">
        <SparkleField prefersReduced={prefersReduced} />
        <FlyerField prefersReduced={prefersReduced} />

        <div className="relative z-10 flex w-full flex-col items-center">
          <HeroCopy prefersReduced={prefersReduced} />
          <FlyerMarquee prefersReduced={prefersReduced} />
        </div>
      </div>
    </section>
  );
}

const ROTATING_WORDS = [
  {
    text: 'fete',
    gradient:
      'linear-gradient(100deg, var(--primary) 0%, #d6407e 55%, #f58b2e 100%)',
  },
  {
    text: 'concert',
    gradient: 'linear-gradient(100deg, #7c3aed 0%, #d6407e 100%)',
  },
  {
    text: 'festival',
    gradient: 'linear-gradient(100deg, #f97316 0%, #ef4444 60%, #d6407e 100%)',
  },
  {
    text: 'boat cruise',
    gradient: 'linear-gradient(100deg, #0284c7 0%, #06b6d4 60%, #2dd4bf 100%)',
  },
  {
    text: 'open mic',
    gradient: 'linear-gradient(100deg, #d97706 0%, #f43f5e 100%)',
  },
  {
    text: 'conference',
    gradient: 'linear-gradient(100deg, var(--primary) 0%, #0ea5e9 100%)',
  },
  {
    text: 'networking event',
    gradient: 'linear-gradient(100deg, #0891b2 0%, #6366f1 100%)',
  },
  {
    text: 'games night',
    gradient: 'linear-gradient(100deg, #16a34a 0%, #84cc16 100%)',
  },
  {
    text: 'run club',
    gradient: 'linear-gradient(100deg, #65a30d 0%, #0284c7 100%)',
  },
];

function rotatingWordSize(word: string) {
  const widthEm = (word.length * 0.56).toFixed(2);
  return `min(clamp(2.9rem, 10vw, 5.75rem), calc(min(88vw, 46rem) / ${widthEm}))`;
}

function HeroCopy({ prefersReduced }: { prefersReduced: boolean }) {
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    if (prefersReduced) return;
    const timer = setInterval(
      () => setWordIndex((i) => (i + 1) % ROTATING_WORDS.length),
      2600
    );
    return () => clearInterval(timer);
  }, [prefersReduced]);

  const word = prefersReduced ? ROTATING_WORDS[0] : ROTATING_WORDS[wordIndex];
  const enter = (delay: number) =>
    prefersReduced
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.6,
            delay,
            ease: [0.22, 1, 0.36, 1] as const,
          },
        };

  return (
    <div className="mx-auto w-full max-w-3xl text-center">
      <motion.h1
        id="hero-heading"
        {...enter(0)}
        className={cn(
          'text-[clamp(2.9rem,10vw,5.75rem)] font-bold leading-[1.02] tracking-tight text-foreground',
          displayFont.className
        )}
      >
        <span className="sr-only">Your next fete sells out here.</span>
        <span aria-hidden className="block">
          Your next
        </span>
        <span
          aria-hidden
          className="flex items-center justify-center"
          style={{ height: 'calc(clamp(2.9rem, 10vw, 5.75rem) * 1.06)' }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={word.text}
              initial={{ opacity: 0, y: '0.4em' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '-0.4em' }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="inline-block whitespace-nowrap bg-clip-text text-transparent"
              style={{
                backgroundImage: word.gradient,
                fontSize: rotatingWordSize(word.text),
              }}
            >
              {word.text}
            </motion.span>
          </AnimatePresence>
        </span>
        <span
          aria-hidden
          className="block whitespace-nowrap"
          style={{ fontSize: rotatingWordSize('sells out here.') }}
        >
          sells out here.
        </span>
      </motion.h1>

      <motion.p
        {...enter(0.12)}
        className="mx-auto mt-5 max-w-[44ch] text-pretty text-base leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg"
      >
        Set up your event in minutes. TropTix handles ticket sales, check-in,
        and payouts, so you can focus on the vibes.
      </motion.p>

      <motion.div
        {...enter(0.22)}
        className="mt-8 flex flex-col items-center gap-4 sm:mt-10"
      >
        <Link
          href="/organizer/events/new"
          className="inline-flex h-14 items-center justify-center rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-[0_12px_32px_-12px] shadow-primary/55 transition-all hover:bg-primary/90 hover:shadow-[0_16px_40px_-14px] hover:shadow-primary/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Create your event
        </Link>

        <Link
          href="/discover"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Looking for tickets? Explore events
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </motion.div>
    </div>
  );
}

type Spark = {
  x: number;
  y: number;
  size: number;
  kind: 'pixel' | 'star';
  color: string;
  duration: number;
  delay: number;
};

const SPARKS: Spark[] = [
  {
    x: 22,
    y: 13,
    size: 10,
    kind: 'star',
    color: 'var(--primary)',
    duration: 4.5,
    delay: 0,
  },
  {
    x: 15,
    y: 30,
    size: 3,
    kind: 'pixel',
    color: '#e0387a',
    duration: 3.8,
    delay: 1.4,
  },
  {
    x: 31,
    y: 7,
    size: 2,
    kind: 'pixel',
    color: 'var(--primary)',
    duration: 5.2,
    delay: 0.7,
  },
  {
    x: 45,
    y: 5,
    size: 8,
    kind: 'star',
    color: '#2dd4bf',
    duration: 5.8,
    delay: 2.2,
  },
  {
    x: 69,
    y: 9,
    size: 9,
    kind: 'star',
    color: '#f58b2e',
    duration: 4.2,
    delay: 1.1,
  },
  {
    x: 82,
    y: 19,
    size: 3,
    kind: 'pixel',
    color: 'var(--primary)',
    duration: 3.6,
    delay: 2.8,
  },
  {
    x: 91,
    y: 37,
    size: 2,
    kind: 'pixel',
    color: '#d6407e',
    duration: 4.8,
    delay: 0.4,
  },
  {
    x: 88,
    y: 56,
    size: 10,
    kind: 'star',
    color: 'var(--primary)',
    duration: 5.4,
    delay: 1.8,
  },
  {
    x: 77,
    y: 69,
    size: 3,
    kind: 'pixel',
    color: '#2dd4bf',
    duration: 4.0,
    delay: 3.1,
  },
  {
    x: 65,
    y: 85,
    size: 2,
    kind: 'pixel',
    color: 'var(--primary)',
    duration: 5.0,
    delay: 0.9,
  },
  {
    x: 55,
    y: 93,
    size: 3,
    kind: 'pixel',
    color: '#f58b2e',
    duration: 4.4,
    delay: 2.5,
  },
  {
    x: 30,
    y: 79,
    size: 9,
    kind: 'star',
    color: '#d6407e',
    duration: 5.6,
    delay: 1.5,
  },
  {
    x: 18,
    y: 63,
    size: 3,
    kind: 'pixel',
    color: '#f58b2e',
    duration: 3.9,
    delay: 0.2,
  },
  {
    x: 8,
    y: 46,
    size: 2,
    kind: 'pixel',
    color: 'var(--primary)',
    duration: 4.7,
    delay: 2.0,
  },
  {
    x: 5,
    y: 79,
    size: 2,
    kind: 'pixel',
    color: '#e0387a',
    duration: 5.3,
    delay: 3.4,
  },
  {
    x: 94,
    y: 82,
    size: 8,
    kind: 'star',
    color: '#2dd4bf',
    duration: 4.9,
    delay: 0.6,
  },
];

function SparkleIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" style={style} className="block">
      <path
        d="M12 0c.6 7 4.4 10.9 12 12-7.6 1.1-11.4 5-12 12-.6-7-4.4-10.9-12-12C7.6 10.9 11.4 7 12 0Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SparkleField({ prefersReduced }: { prefersReduced: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {SPARKS.map((spark, i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{
            left: `${spark.x}%`,
            top: `${spark.y}%`,
            opacity: prefersReduced ? 0.25 : undefined,
          }}
          animate={
            prefersReduced
              ? undefined
              : {
                  opacity: [0.06, 0.5, 0.06],
                  scale: spark.kind === 'star' ? [0.7, 1, 0.7] : [1, 1, 1],
                }
          }
          transition={
            prefersReduced
              ? undefined
              : {
                  duration: spark.duration,
                  delay: spark.delay,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }
          }
        >
          {spark.kind === 'pixel' ? (
            <span
              className="block rounded-[1px]"
              style={{
                width: spark.size,
                height: spark.size,
                background: spark.color,
              }}
            />
          ) : (
            <SparkleIcon
              style={{
                width: spark.size,
                height: spark.size,
                color: spark.color,
              }}
            />
          )}
        </motion.span>
      ))}
    </div>
  );
}

type FlyerSpec = {
  id: string;
  art: React.ReactNode;
  position: string;
  rotate: number;
  size: string;
  minShow?: 'lg' | 'xl';
  drift: { y: number; duration: number; delay: number };
};

function FlyerField({ prefersReduced }: { prefersReduced: boolean }) {
  return (
    <div aria-hidden className="absolute inset-0 z-0 hidden md:block">
      {FLYERS.map((f, i) => (
        <motion.div
          key={f.id}
          className={cn(
            'absolute',
            f.position,
            f.size,
            f.minShow === 'lg' && 'hidden lg:block',
            f.minShow === 'xl' && 'hidden xl:block'
          )}
          initial={
            prefersReduced
              ? false
              : { opacity: 0, scale: 0.75, y: 28, rotate: f.rotate }
          }
          animate={{ opacity: 1, scale: 1, y: 0, rotate: f.rotate }}
          transition={{
            type: 'spring',
            stiffness: 120,
            damping: 16,
            delay: prefersReduced ? 0 : 0.15 + i * 0.07,
          }}
        >
          <motion.div
            animate={prefersReduced ? undefined : { y: [0, f.drift.y, 0] }}
            transition={
              prefersReduced
                ? undefined
                : {
                    duration: f.drift.duration,
                    delay: f.drift.delay,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }
            }
          >
            <FlyerFrame>{f.art}</FlyerFrame>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}

function FlyerMarquee({ prefersReduced }: { prefersReduced: boolean }) {
  const track = [...FLYERS, ...FLYERS];

  return (
    <div
      aria-hidden
      className="mt-12 w-full overflow-hidden md:hidden"
      style={{
        maskImage:
          'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)',
      }}
    >
      <motion.div
        className="flex w-max gap-4"
        animate={prefersReduced ? undefined : { x: ['0%', '-50%'] }}
        transition={
          prefersReduced
            ? undefined
            : { duration: 45, repeat: Infinity, ease: 'linear' }
        }
      >
        {track.map((f, i) => (
          <div key={`${f.id}-${i}`} className="w-32 shrink-0">
            <FlyerFrame>{f.art}</FlyerFrame>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

const FLYERS: FlyerSpec[] = [
  {
    id: 'soca-brunch',
    art: <SocaBrunchFlyer />,
    position: 'left-[3%] top-[16%] xl:left-[6%]',
    rotate: -6,
    size: 'w-36 xl:w-40',
    drift: { y: -10, duration: 9, delay: 0 },
  },
  {
    id: 'band-launch',
    art: <BandLaunchFlyer />,
    position: 'left-[7%] top-[47%]',
    rotate: 4,
    size: 'w-36',
    minShow: 'xl',
    drift: { y: -8, duration: 11, delay: 1.2 },
  },
  {
    id: 'domino-night',
    art: <DominoNightFlyer />,
    position: 'bottom-[4%] left-[2.5%] xl:left-[5%]',
    rotate: 5,
    size: 'w-32 xl:w-36',
    drift: { y: -9, duration: 10, delay: 0.6 },
  },
  {
    id: 'sunset-cruise',
    art: <SunsetCruiseFlyer />,
    position: 'right-[3%] top-[14%] xl:right-[6%]',
    rotate: 6,
    size: 'w-36 xl:w-40',
    drift: { y: -11, duration: 10, delay: 0.3 },
  },
  {
    id: 'beach-fete',
    art: <BeachFeteFlyer />,
    position: 'right-[7%] top-[45%]',
    rotate: -4,
    size: 'w-36',
    minShow: 'xl',
    drift: { y: -8, duration: 12, delay: 1.6 },
  },
  {
    id: 'reggae-night',
    art: <ReggaeNightFlyer />,
    position: 'bottom-[4%] right-[2.5%] xl:right-[5%]',
    rotate: -5,
    size: 'w-32 xl:w-36',
    drift: { y: -10, duration: 9.5, delay: 0.9 },
  },
  {
    id: 'art-wine',
    art: <ArtWineFlyer />,
    position: 'left-[24%] top-[11%] xl:left-[26%]',
    rotate: 3,
    size: 'w-28 xl:w-32',
    minShow: 'lg',
    drift: { y: -7, duration: 11, delay: 2 },
  },
  {
    id: 'jouvert',
    art: <JouvertFlyer />,
    position: 'bottom-[2%] right-[27%] xl:right-[29%]',
    rotate: -3,
    size: 'w-28 xl:w-32',
    minShow: 'lg',
    drift: { y: -7, duration: 10.5, delay: 1.4 },
  },
];
