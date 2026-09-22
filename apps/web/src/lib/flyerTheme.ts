import type { CSSProperties } from 'react';
import type { EventPageTheme, FlyerPalette } from '@troptix/api';

type HSL = { h: number; s: number; l: number };

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

function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return { h: 0, s: 0, l };
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h: number;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (mx === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

function hexToHsl(hex: string): HSL {
  const n = hex.replace('#', '');
  return rgbToHsl(
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16)
  );
}

function hslToHex({ h, s, l }: HSL): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
      .toUpperCase()
  );
}

function luminance({ h, s, l }: HSL): number {
  const lin = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hslToRgb(h, s, l);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: HSL, b: HSL): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function parseTriplet(value: string): HSL {
  const m = value.match(/^(?:hsl\()?(-?[\d.]+) ([\d.]+)% ([\d.]+)%\)?$/);
  if (!m) throw new Error(`not an HSL color: "${value}"`);
  return {
    h: parseFloat(m[1]),
    s: parseFloat(m[2]) / 100,
    l: parseFloat(m[3]) / 100,
  };
}

export function tripletContrast(a: string, b: string): number {
  return contrast(parseTriplet(a), parseTriplet(b));
}

function solveL(c: HSL, vs: HSL, target: number, dir: 1 | -1): HSL {
  let l = c.l;
  let guard = 0;
  while (contrast({ ...c, l }, vs) < target && guard++ < 220) {
    l += dir * 0.005;
    if (l <= 0.02 || l >= 0.98) break;
  }
  return { ...c, l };
}

function solveCta(vib: HSL, bg: HSL): { fill: HSL; ink: HSL } {
  const away: 1 | -1 = bg.l > 0.5 ? -1 : 1;
  const base = solveL(vib, bg, 3, away);
  const darkInk: HSL = { h: vib.h, s: 0.55, l: 0.09 };
  const liteInk: HSL = { h: vib.h, s: 0.35, l: 0.97 };
  const candidates = [
    { fill: solveL(base, liteInk, 4.5, -1), ink: liteInk },
    { fill: solveL(base, darkInk, 4.5, 1), ink: darkInk },
  ].filter((c) => contrast(c.fill, bg) >= 3 && contrast(c.fill, c.ink) >= 4.5);
  if (candidates.length === 0) {
    const fill = solveL({ ...vib, l: bg.l > 0.5 ? 0.35 : 0.65 }, bg, 4.5, away);
    return { fill, ink: bg.l > 0.5 ? liteInk : darkInk };
  }
  candidates.sort(
    (a, b) => Math.abs(a.fill.l - vib.l) - Math.abs(b.fill.l - vib.l)
  );
  return candidates[0];
}

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * The image must be loaded and fetched with crossOrigin="anonymous" — a tainted
 * canvas throws and every palette silently comes back null.
 */
export function extractFlyerPalette(
  img: HTMLImageElement
): FlyerPalette | null {
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
      // Transparent pixels (logo-style PNGs) would otherwise read as opaque
      // black and swamp the dominant bucket.
      if (px[i + 3] < 125) continue;
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
    if (total === 0) return null;
    const clusters = entries
      .map((e) => ({
        ...rgbToHsl(e.r / e.n, e.g / e.n, e.b / e.n),
        share: e.n / total,
      }))
      .sort((a, b) => b.share - a.share)
      .slice(0, 12);
    const score = (c: (typeof clusters)[number]) =>
      c.s * Math.sqrt(c.share) * (1 - Math.abs(c.l - 0.5) * 1.3);
    const vivid = clusters
      .filter((c) => c.s >= 0.22 && c.l >= 0.18 && c.l <= 0.85)
      .sort((a, b) => score(b) - score(a));
    const candidates: HSL[] = [];
    for (const c of vivid) {
      if (
        candidates.every(
          (k) => hueDist(k.h, c.h) > 25 || Math.abs(k.l - c.l) > 0.25
        )
      ) {
        candidates.push(c);
      }
      if (candidates.length === 5) break;
    }
    return {
      dominant: hslToHex(clusters[0]),
      candidates: candidates.map(hslToHex),
      chosenAccent: null,
    };
  } catch {
    return null;
  }
}

export function extractFlyerPaletteFromUrl(
  url: string
): Promise<FlyerPalette | null> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(extractFlyerPalette(img));
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Full hsl() colors: the v4 token wiring maps utilities to var(--x) directly,
// so a bare "H S% L%" triplet would be an invalid color and silently no-op.
const t = ({ h, s, l }: HSL) =>
  `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

export type ThemeVars = Record<string, string>;

export function leadColor(palette: FlyerPalette | null): string | null {
  if (!palette) return null;
  return palette.chosenAccent ?? palette.candidates[0] ?? null;
}

export function themeAvailable(palette: FlyerPalette | null): boolean {
  return leadColor(palette) !== null;
}

function accentColor(palette: FlyerPalette, lead: HSL): HSL {
  const hex = palette.candidates.find(
    (c) => hueDist(hexToHsl(c).h, lead.h) > 40
  );
  return hex ? hexToHsl(hex) : lead;
}

function deriveWash(
  palette: FlyerPalette,
  dominant: HSL,
  lead: HSL
): ThemeVars {
  // Poster backgrounds are usually near-black or near-white — no usable hue.
  // Tint from the lead color in that case: it's the flyer's identity.
  const domDull = dominant.s < 0.25 || dominant.l < 0.2 || dominant.l > 0.85;
  const src = domDull ? lead : dominant;
  const H = src.h;
  const S = Math.min(0.5, Math.max(0.22, src.s * 0.5));
  const bg: HSL = { h: H, s: S, l: 0.94 };
  const secondary: HSL = { h: H, s: S, l: 0.88 };
  const ink = solveL({ h: H, s: 0.3, l: 0.14 }, bg, 12, -1);
  const muted = solveL({ h: H, s: 0.18, l: 0.5 }, secondary, 4.6, -1);
  const cta = solveCta(lead, bg);
  const acc = accentColor(palette, lead);
  return {
    '--background': t(bg),
    '--foreground': t(ink),
    '--card': 'hsl(0 0% 100%)',
    '--card-foreground': t(ink),
    '--popover': 'hsl(0 0% 100%)',
    '--popover-foreground': t(ink),
    '--primary': t(cta.fill),
    '--primary-foreground': t(cta.ink),
    '--secondary': t(secondary),
    '--secondary-foreground': t(ink),
    '--muted': t({ h: H, s: S, l: 0.91 }),
    '--muted-foreground': t(muted),
    '--accent': t({ h: acc.h, s: Math.min(0.5, acc.s), l: 0.88 }),
    '--accent-foreground': t(ink),
    '--border': t({ h: H, s: S, l: 0.85 }),
    '--input': t({ h: H, s: S, l: 0.85 }),
    '--ring': t(cta.fill),
  };
}

function deriveDark(
  palette: FlyerPalette,
  dominant: HSL,
  lead: HSL
): ThemeVars {
  const domDull = dominant.s < 0.15;
  const src = domDull ? lead : dominant;
  const H = src.h;
  const S = Math.min(0.45, Math.max(0.15, src.s * 0.55));
  const bg: HSL = { h: H, s: S, l: 0.1 };
  const secondary: HSL = { h: H, s: S * 0.8, l: 0.2 };
  const ink: HSL = { h: H, s: 0.12, l: 0.94 };
  const muted = solveL({ h: H, s: 0.1, l: 0.55 }, secondary, 4.6, 1);
  const cta = solveCta(lead, bg);
  const acc = solveCta(accentColor(palette, lead), bg);
  return {
    '--background': t(bg),
    '--foreground': t(ink),
    '--card': t({ h: H, s: S * 0.9, l: 0.145 }),
    '--card-foreground': t(ink),
    '--popover': t({ h: H, s: S * 0.9, l: 0.145 }),
    '--popover-foreground': t(ink),
    '--primary': t(cta.fill),
    '--primary-foreground': t(cta.ink),
    '--secondary': t(secondary),
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

export function deriveThemeVars(
  theme: EventPageTheme,
  palette: FlyerPalette | null
): ThemeVars | null {
  if (theme === 'off' || !palette) return null;
  const lead = leadColor(palette);
  if (!lead) return null;
  const dominant = hexToHsl(palette.dominant);
  const leadHsl = hexToHsl(lead);
  return theme === 'wash'
    ? deriveWash(palette, dominant, leadHsl)
    : deriveDark(palette, dominant, leadHsl);
}

export function themeStyle(
  theme: EventPageTheme,
  palette: FlyerPalette | null
): CSSProperties | undefined {
  return (deriveThemeVars(theme, palette) ?? undefined) as
    | CSSProperties
    | undefined;
}
