'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// PROTOTYPE — throwaway. Three flyer-derived theme treatments on the real
// event page, switchable via ?theme= (off | wash | dark) from the floating
// bar. Colors are extracted from the flyer's pixels, then derived through
// contrast guardrails and applied as overrides to the shadcn CSS variables.
// Dev-only; delete or fold the winning treatment into the page when decided.

// Dev and Vercel preview deploys only — never the production site.
export const FLYER_THEME_PROTOTYPE_ENABLED =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview';

type HSL = { h: number; s: number; l: number };
type Extraction = {
  dominant: HSL;
  vibrant: HSL | null;
  vibrant2: HSL | null;
  isGray: boolean;
};

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function luminance(h: number, s: number, l: number): number {
  const lin = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hslToRgb(h, s, l);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: HSL, b: HSL): number {
  const [hi, lo] = [luminance(a.h, a.s, a.l), luminance(b.h, b.s, b.l)].sort(
    (x, y) => y - x
  );
  return (hi + 0.05) / (lo + 0.05);
}

// Walk lightness until the color clears `target` against `vs`.
function solveL(c: HSL, vs: HSL, target: number, dir: 1 | -1): HSL {
  let l = c.l;
  let guard = 0;
  while (contrast({ ...c, l }, vs) < target && guard++ < 220) {
    l += dir * 0.005;
    if (l <= 0.02 || l >= 0.98) break;
  }
  return { ...c, l };
}

// CTA pair: keep the flyer color, darken (light text) or lighten (dark text) —
// whichever moves it less.
function solveCta(vib: HSL): { fill: HSL; ink: HSL } {
  const darkInk: HSL = { h: vib.h, s: 0.55, l: 0.09 };
  const liteInk: HSL = { h: vib.h, s: 0.35, l: 0.97 };
  const asDark = solveL(vib, liteInk, 4.5, -1);
  const asLite = solveL(vib, darkInk, 4.5, 1);
  return Math.abs(asDark.l - vib.l) <= Math.abs(asLite.l - vib.l)
    ? { fill: asDark, ink: liteInk }
    : { fill: asLite, ink: darkInk };
}

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function extract(img: HTMLImageElement): Extraction | null {
  try {
    const w = 96;
    const h = Math.max(
      1,
      Math.round((img.naturalHeight / img.naturalWidth) * w)
    );
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const buckets = new Map<
      string,
      { n: number; r: number; g: number; b: number }
    >();
    for (let i = 0; i < px.length; i += 16) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const key = `${r >> 5},${g >> 5},${b >> 5}`;
      const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++;
      e.r += r;
      e.g += g;
      e.b += b;
      buckets.set(key, e);
    }
    const entries = Array.from(buckets.values());
    const total = entries.reduce((a, e) => a + e.n, 0);
    const clusters = entries
      .map((e) => {
        const r = e.r / e.n / 255;
        const g = e.g / e.n / 255;
        const b = e.b / e.n / 255;
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const l = (mx + mn) / 2;
        let hDeg = 0;
        let s = 0;
        if (mx !== mn) {
          const d = mx - mn;
          s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
          if (mx === r) hDeg = ((g - b) / d + (g < b ? 6 : 0)) * 60;
          else if (mx === g) hDeg = ((b - r) / d + 2) * 60;
          else hDeg = ((r - g) / d + 4) * 60;
        }
        return { h: hDeg, s, l, share: e.n / total };
      })
      .sort((a, b) => b.share - a.share)
      .slice(0, 12);
    const dominant = clusters[0];
    const score = (c: (typeof clusters)[number]) =>
      c.s * Math.sqrt(c.share) * (1 - Math.abs(c.l - 0.5) * 1.3);
    const vivid = clusters
      .filter((c) => c.s >= 0.22 && c.l >= 0.18 && c.l <= 0.85)
      .sort((a, b) => score(b) - score(a));
    const vibrant = vivid[0] ?? null;
    const vibrant2 = vibrant
      ? (vivid.find((c) => hueDist(c.h, vibrant.h) > 40) ?? null)
      : null;
    const isGray = !clusters.some((c) => c.s >= 0.15 && c.share > 0.03);
    return { dominant, vibrant, vibrant2, isGray };
  } catch {
    return null; // CORS-tainted canvas — treatments fall back to brand
  }
}

const t = ({ h, s, l }: HSL) =>
  `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;

type Overrides = Record<string, string>;

function deriveWash(ex: Extraction): Overrides {
  if (ex.isGray || !ex.vibrant) return {};
  const H = ex.dominant.h;
  const S = Math.min(0.28, Math.max(0.06, ex.dominant.s * 0.4));
  const bg: HSL = { h: H, s: S, l: 0.965 };
  const ink = solveL({ h: H, s: 0.3, l: 0.14 }, bg, 12, -1);
  const muted = solveL({ h: H, s: 0.14, l: 0.5 }, bg, 4.6, -1);
  const cta = solveCta(ex.vibrant);
  const acc = ex.vibrant2 ?? ex.vibrant;
  return {
    '--background': t(bg),
    '--foreground': t(ink),
    '--card': '0 0% 100%',
    '--card-foreground': t(ink),
    '--popover': '0 0% 100%',
    '--popover-foreground': t(ink),
    '--primary': t(cta.fill),
    '--primary-foreground': t(cta.ink),
    '--secondary': t({ h: H, s: Math.min(0.3, S + 0.05), l: 0.91 }),
    '--secondary-foreground': t(ink),
    '--muted': t({ h: H, s: S, l: 0.94 }),
    '--muted-foreground': t(muted),
    '--accent': t({ h: acc.h, s: Math.min(0.5, acc.s), l: 0.9 }),
    '--accent-foreground': t(ink),
    '--border': t({ h: H, s: Math.min(0.3, S + 0.05), l: 0.885 }),
    '--input': t({ h: H, s: Math.min(0.3, S + 0.05), l: 0.885 }),
    '--ring': t(cta.fill),
  };
}

function deriveDark(ex: Extraction): Overrides {
  const gray = ex.isGray || !ex.vibrant;
  const H = gray ? 0 : ex.dominant.h;
  const S = gray ? 0 : Math.min(0.45, Math.max(0.15, ex.dominant.s * 0.55));
  const bg: HSL = { h: H, s: S, l: 0.1 };
  const ink: HSL = { h: H, s: gray ? 0 : 0.12, l: 0.94 };
  const muted = solveL({ h: H, s: gray ? 0 : 0.1, l: 0.55 }, bg, 4.6, 1);
  let cta: { fill: HSL; ink: HSL };
  let acc: { fill: HSL; ink: HSL };
  if (gray) {
    cta = {
      fill: { h: 236, s: 0.86, l: 0.76 },
      ink: { h: 236, s: 0.5, l: 0.1 },
    };
    acc = cta;
  } else {
    const lift = (c: HSL): HSL =>
      solveL({ ...c, l: Math.max(c.l, 0.45) }, bg, 2.5, 1);
    cta = solveCta(lift(ex.vibrant!));
    acc = solveCta(lift(ex.vibrant2 ?? ex.vibrant!));
  }
  return {
    '--background': t(bg),
    '--foreground': t(ink),
    '--card': t({ h: H, s: S * 0.9, l: 0.145 }),
    '--card-foreground': t(ink),
    '--popover': t({ h: H, s: S * 0.9, l: 0.145 }),
    '--popover-foreground': t(ink),
    '--primary': t(cta.fill),
    '--primary-foreground': t(cta.ink),
    '--secondary': t({ h: H, s: S * 0.8, l: 0.2 }),
    '--secondary-foreground': t(ink),
    '--muted': t({ h: H, s: S * 0.8, l: 0.17 }),
    '--muted-foreground': t(muted),
    '--accent': t(acc.fill),
    '--accent-foreground': t(acc.ink),
    '--border': t({ h: H, s: S * 0.8, l: 0.24 }),
    '--input': t({ h: H, s: S * 0.8, l: 0.24 }),
    '--ring': t(cta.fill),
  };
}

const THEMES = ['off', 'wash', 'dark'] as const;
type Theme = (typeof THEMES)[number];
const LABELS: Record<Theme, string> = {
  off: 'Off — current brand',
  wash: 'Tinted wash',
  dark: 'Poster dark',
};

export default function FlyerThemePrototype({
  imageUrl,
}: {
  imageUrl: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ex, setEx] = useState<Extraction | null>(null);

  const raw = searchParams?.get('theme');
  const theme: Theme = THEMES.includes(raw as Theme) ? (raw as Theme) : 'off';

  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!cancelled) setEx(extract(img));
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    if (theme === 'off' || !ex) return;
    const overrides = theme === 'wash' ? deriveWash(ex) : deriveDark(ex);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(overrides))
      root.style.setProperty(k, v);
    return () => {
      for (const k of Object.keys(overrides)) root.style.removeProperty(k);
    };
  }, [theme, ex]);

  const go = (dir: 1 | -1) => {
    const next =
      THEMES[(THEMES.indexOf(theme) + dir + THEMES.length) % THEMES.length];
    const params = new URLSearchParams(searchParams?.toString());
    if (next === 'off') params.delete('theme');
    else params.set('theme', next);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable)
      )
        return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!FLYER_THEME_PROTOTYPE_ENABLED) return null;

  const washUnavailable = ex !== null && (ex.isGray || !ex.vibrant);

  return (
    <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full bg-slate-900 py-1.5 pl-1.5 pr-4 font-mono text-xs text-white shadow-2xl ring-1 ring-white/20">
        <button
          type="button"
          aria-label="Previous theme"
          onClick={() => go(-1)}
          className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/15"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next theme"
          onClick={() => go(1)}
          className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/15"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="pl-2">
          flyer theme: <b>{LABELS[theme]}</b>
          {ex === null && ' · extracting…'}
          {theme === 'wash' &&
            washUnavailable &&
            ' · no usable color, brand kept'}
        </span>
      </div>
    </div>
  );
}
