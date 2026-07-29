import type { EventPageTheme, FlyerPalette } from '@troptix/api';

// Flyer-derived page theming. Extraction runs ONCE, client-side, when the
// organizer uploads a flyer (`extractFlyerPalette`); the palette is stored on
// the event. Derivation (`deriveThemeVars`) is a pure function of the stored
// palette — cheap enough to run on every render, server or client — and owns
// the contrast guardrails: body ink ≥12:1 vs the ground, muted text ≥4.6:1 vs
// every emitted surface, CTA label ≥4.5:1 on its fill, and the CTA fill (and
// so --ring) ≥3:1 vs the ground. flyerTheme.test.ts holds these to account.

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

/** Walk lightness until the color clears `target` contrast against `vs`. */
function solveL(c: HSL, vs: HSL, target: number, dir: 1 | -1): HSL {
  let l = c.l;
  let guard = 0;
  while (contrast({ ...c, l }, vs) < target && guard++ < 220) {
    l += dir * 0.005;
    if (l <= 0.02 || l >= 0.98) break;
  }
  return { ...c, l };
}

// CTA pair: keep the flyer color while clearing two independent bars — the
// fill must read as a shape against the page (≥3:1, the WCAG non-text
// minimum; also covers --ring), and the label must read on the fill (≥4.5:1).
// Candidates darken (light text) or lighten (dark text); any that sink back
// into the ground are discarded, then the survivor that moves the fill least
// from the flyer's actual color wins.
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

// --- extraction (client-only: needs a canvas) ---------------------------------

/**
 * Sample the flyer's pixels and reduce them to a storable palette. Returns
 * null when the canvas is CORS-tainted or empty. The image must be loaded
 * (naturalWidth > 0) and fetched with crossOrigin="anonymous".
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
    const vibrant = vivid[0] ?? null;
    const vibrant2 = vibrant
      ? (vivid.find((c) => hueDist(c.h, vibrant.h) > 40) ?? null)
      : null;
    return {
      dominant: hslToHex(clusters[0]),
      vibrant: vibrant ? hslToHex(vibrant) : null,
      vibrant2: vibrant2 ? hslToHex(vibrant2) : null,
      isGray: !clusters.some((c) => c.s >= 0.15 && c.share > 0.03),
    };
  } catch {
    return null;
  }
}

/**
 * Load an image URL and extract its palette. Resolves null on load failure or
 * a CORS-tainted canvas — callers treat that as "no palette".
 */
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

// --- derivation (pure; server-safe) --------------------------------------------

const t = ({ h, s, l }: HSL) =>
  `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;

/** shadcn CSS variable overrides, as `--var: "H S% L%"` triplets. */
export type ThemeVars = Record<string, string>;

function deriveWash(palette: FlyerPalette): ThemeVars | null {
  if (palette.isGray || !palette.vibrant) return null;
  const dominant = hexToHsl(palette.dominant);
  const vibrant = hexToHsl(palette.vibrant);
  // Poster backgrounds are usually near-black or near-white — no usable hue.
  // Tint from the vibrant color in that case: it's the flyer's identity.
  const domDull = dominant.s < 0.25 || dominant.l < 0.2 || dominant.l > 0.85;
  const src = domDull ? vibrant : dominant;
  const H = src.h;
  const S = Math.min(0.5, Math.max(0.22, src.s * 0.5));
  const bg: HSL = { h: H, s: S, l: 0.94 };
  // Secondary is the darkest light surface the theme emits — muted text solved
  // against it clears every other surface (bg, card, muted) for free.
  const secondary: HSL = { h: H, s: S, l: 0.88 };
  const ink = solveL({ h: H, s: 0.3, l: 0.14 }, bg, 12, -1);
  const muted = solveL({ h: H, s: 0.18, l: 0.5 }, secondary, 4.6, -1);
  const cta = solveCta(vibrant, bg);
  const acc = palette.vibrant2 ? hexToHsl(palette.vibrant2) : vibrant;
  return {
    '--background': t(bg),
    '--foreground': t(ink),
    '--card': '0 0% 100%',
    '--card-foreground': t(ink),
    '--popover': '0 0% 100%',
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

function deriveDark(palette: FlyerPalette): ThemeVars | null {
  if (palette.isGray || !palette.vibrant) return null;
  const dominant = hexToHsl(palette.dominant);
  const vibrant = hexToHsl(palette.vibrant);
  // A desaturated dominant (grayscale converts to hue 0 — red) carries no
  // real hue, and the saturation floor below would manufacture color from it.
  // Unlike wash, a *dark* saturated dominant is fine here: it is already the
  // stage. Only near-gray hands the hue to the vibrant color.
  const domDull = dominant.s < 0.15;
  const src = domDull ? vibrant : dominant;
  const H = src.h;
  const S = Math.min(0.45, Math.max(0.15, src.s * 0.55));
  const bg: HSL = { h: H, s: S, l: 0.1 };
  // Secondary is the lightest dark surface — solving muted text against it
  // clears bg, card, and muted too.
  const secondary: HSL = { h: H, s: S * 0.8, l: 0.2 };
  const ink: HSL = { h: H, s: 0.12, l: 0.94 };
  const muted = solveL({ h: H, s: 0.1, l: 0.55 }, secondary, 4.6, 1);
  const cta = solveCta(vibrant, bg);
  const acc = solveCta(
    palette.vibrant2 ? hexToHsl(palette.vibrant2) : vibrant,
    bg
  );
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

/**
 * The CSS variable overrides for an event's stored theme, or null when the
 * page should render the brand theme (theme off, no palette, or a palette
 * with no usable color).
 */
export function deriveThemeVars(
  theme: EventPageTheme,
  palette: FlyerPalette | null
): ThemeVars | null {
  if (theme === 'off' || !palette) return null;
  return theme === 'wash' ? deriveWash(palette) : deriveDark(palette);
}

/** Whether a treatment can render for this palette (drives picker states). */
export function themeAvailable(palette: FlyerPalette | null): boolean {
  return !!palette && !palette.isGray && !!palette.vibrant;
}
