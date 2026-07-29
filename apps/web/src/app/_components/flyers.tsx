import { Anton } from 'next/font/google';

import { cn } from '@/lib/utils';

const posterFont = Anton({ weight: '400', subsets: ['latin'] });

export function FlyerFrame({
  children,
  aspect = 'square',
}: {
  children: React.ReactNode;
  aspect?: 'square' | 'portrait';
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-[0_18px_40px_-18px_rgba(15,23,42,0.28),0_4px_12px_-6px_rgba(15,23,42,0.12)] ring-1 ring-foreground/[0.06]">
      <div
        className={cn(
          'w-full',
          aspect === 'square' ? 'aspect-square' : 'aspect-[4/5]'
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function SocaBrunchFlyer() {
  return (
    <div className="flex h-full flex-col justify-between bg-[#fff4e4] p-3">
      <p className="text-[8px] font-semibold uppercase tracking-[0.22em] text-[#b3541e]">
        Sun · 11am
      </p>
      <div className="font-extrabold uppercase leading-[0.88] tracking-tight text-[#e0387a]">
        <p className="text-[26px]">Soca</p>
        <p className="text-[26px]">Brunch</p>
      </div>
      <p className="text-[8px] font-medium uppercase tracking-[0.18em] text-[#b3541e]">
        Bottomless til 3
      </p>
    </div>
  );
}

export function ReggaeNightFlyer() {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden bg-[#111210] p-3">
      <div className="absolute inset-x-0 bottom-0 h-6">
        <div className="h-2 bg-[#1d8a3c]" />
        <div className="h-2 bg-[#f5c518]" />
        <div className="h-2 bg-[#d93a2b]" />
      </div>
      <p className="text-[8px] font-semibold uppercase tracking-[0.22em] text-[#f5c518]">
        Every Friday
      </p>
      <div
        className={cn(
          'pb-5 uppercase leading-[0.95] text-[#f7f3e3]',
          posterFont.className
        )}
      >
        <p className="text-[27px]">Reggae</p>
        <p className="text-[27px]">Night</p>
      </div>
    </div>
  );
}

export function BandLaunchFlyer() {
  const confetti = [
    'left-[14%] top-[18%] bg-[#ffd166]',
    'left-[70%] top-[12%] bg-[#ff7b9c]',
    'left-[84%] top-[38%] bg-[#7ae0c3]',
    'left-[22%] top-[62%] bg-[#ff9d3f]',
    'left-[62%] top-[74%] bg-[#ffd166]',
    'left-[38%] top-[30%] bg-[#7ae0c3]',
  ];
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden bg-primary p-3">
      {confetti.map((c, i) => (
        <span key={i} className={cn('absolute h-1.5 w-1.5 rounded-full', c)} />
      ))}
      <div className="flex items-center gap-1 text-[8px] font-semibold uppercase tracking-[0.2em] text-white/80">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-300/80 motion-reduce:animate-none" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-300" />
        </span>
        Selling fast
      </div>
      <div className="font-extrabold uppercase leading-[0.9] text-white">
        <p className="text-[13px] tracking-[0.14em] text-white/70">Carnival</p>
        <p className="text-[24px]">Band</p>
        <p className="text-[24px]">Launch</p>
      </div>
    </div>
  );
}

export function BeachFeteFlyer() {
  return (
    <div
      className="relative flex h-full flex-col justify-between overflow-hidden p-3"
      style={{
        background:
          'linear-gradient(180deg, #bfeef4 0%, #7cd6e6 55%, #1e9dbd 100%)',
      }}
    >
      <svg
        className="absolute inset-x-0 bottom-6 w-full text-white/60"
        viewBox="0 0 100 10"
        preserveAspectRatio="none"
        style={{ height: 8 }}
      >
        <path
          d="M0 5 Q 12.5 0, 25 5 T 50 5 T 75 5 T 100 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
      <p className="text-[8px] font-semibold uppercase tracking-[0.22em] text-[#0b5670]">
        Sat · Sundown
      </p>
      <div
        className={cn(
          'uppercase leading-[0.95] text-[#083b4d]',
          posterFont.className
        )}
      >
        <p className="text-[27px]">Beach</p>
        <p className="text-[27px]">Fete</p>
      </div>
      <span className="self-start rounded-full bg-white/85 px-2 py-0.5 text-[8px] font-semibold text-[#0b5670]">
        From J$4,000
      </span>
    </div>
  );
}

export function SunsetCruiseFlyer() {
  return (
    <div
      className="relative flex h-full flex-col justify-end overflow-hidden p-3"
      style={{
        background:
          'linear-gradient(180deg, #2a1f3d 0%, #83336b 45%, #ec4a7d 72%, #ff9d6e 100%)',
      }}
    >
      <span
        className="absolute left-1/2 top-[18%] h-10 w-10 -translate-x-1/2 rounded-full"
        style={{
          background: 'radial-gradient(circle, #ffe2b0 0%, #ffb46e 70%)',
          boxShadow: '0 0 24px 6px rgba(255,180,110,0.55)',
        }}
      />
      <div
        className={cn(
          'uppercase leading-[0.95] text-[#fff3e2]',
          posterFont.className
        )}
      >
        <p className="text-[25px]">Sunset</p>
        <p className="text-[25px]">Cruise</p>
      </div>
      <p className="mt-1 text-[8px] font-medium uppercase tracking-[0.2em] text-[#ffd9b8]">
        Boarding 5:30pm
      </p>
    </div>
  );
}

export function ArtWineFlyer() {
  return (
    <div className="flex h-full flex-col justify-between bg-[#ece9fb] p-3">
      <p className="text-[8px] font-semibold uppercase tracking-[0.22em] text-[#6d5a9e]">
        Thu · 7pm
      </p>
      <div className="font-serif italic leading-[1.02] text-[#43346d]">
        <p className="text-[19px]">Art &amp;</p>
        <p className="text-[19px]">Wine Lime</p>
      </div>
      <p className="text-[7px] font-medium uppercase tracking-[0.16em] text-[#6d5a9e]">
        Canvas included
      </p>
    </div>
  );
}

export function DominoNightFlyer() {
  return (
    <div className="flex h-full flex-col justify-between bg-[#fbfaf7] p-3">
      <div className="flex h-9 w-6 flex-col rounded-[5px] bg-[#17181c] p-1">
        <div className="grid flex-1 grid-cols-2 place-items-center">
          <span className="h-1 w-1 rounded-full bg-white" />
          <span className="h-1 w-1 rounded-full bg-white" />
          <span className="h-1 w-1 rounded-full bg-white" />
        </div>
        <div className="my-0.5 h-px bg-white/40" />
        <div className="grid flex-1 grid-cols-2 place-items-center">
          <span className="h-1 w-1 rounded-full bg-white" />
          <span className="h-1 w-1 rounded-full bg-white" />
        </div>
      </div>
      <div className="font-extrabold uppercase leading-[0.9] text-[#17181c]">
        <p className="text-[22px]">Domino</p>
        <p className="text-[22px]">Night</p>
      </div>
      <p className="whitespace-nowrap font-mono text-[7px] uppercase tracking-[0.12em] text-[#8a877e]">
        Six love or go home
      </p>
    </div>
  );
}

export function JouvertFlyer() {
  const paint = [
    'left-[8%] top-[10%] h-3 w-3 bg-[#37c98b]',
    'left-[78%] top-[16%] h-2 w-2 bg-[#ff7b9c]',
    'left-[64%] top-[6%] h-1.5 w-1.5 bg-[#5865f2]',
    'left-[18%] top-[70%] h-2 w-2 bg-[#f5c518]',
    'left-[82%] top-[64%] h-3 w-3 bg-[#ff9d3f]',
    'left-[42%] top-[80%] h-1.5 w-1.5 bg-[#37c98b]',
  ];
  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden bg-white p-3">
      {paint.map((c, i) => (
        <span key={i} className={cn('absolute rounded-full', c)} />
      ))}
      <div
        className={cn(
          'text-center uppercase leading-[0.95] text-[#17181c]',
          posterFont.className
        )}
      >
        <p className="text-[20px]">J&rsquo;ouvert</p>
        <p
          className="bg-clip-text text-[32px] text-transparent"
          style={{
            backgroundImage:
              'linear-gradient(100deg, #5865f2, #d6407e, #f58b2e)',
          }}
        >
          4am
        </p>
      </div>
    </div>
  );
}
