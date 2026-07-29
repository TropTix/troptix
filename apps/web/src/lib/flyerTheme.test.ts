import { deriveThemeVars, themeAvailable } from './flyerTheme';
import type { FlyerPalette } from '@troptix/api';

// Holds every emitted pairing to the module's promised WCAG ratios, across
// adversarial palettes where naive derivation is known to fail.

function lum(triplet: string): number {
  const m = triplet.match(/^(-?[\d.]+) ([\d.]+)% ([\d.]+)%$/);
  if (!m) throw new Error(`not an HSL triplet: "${triplet}"`);
  const h = ((parseFloat(m[1]) % 360) + 360) % 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
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
  const lin = (v: number) => {
    v += mm;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const PALETTES: Record<string, FlyerPalette> = {
  'seeded wash (wine + red + gold)': {
    dominant: '#7A1E2B',
    vibrant: '#FF4757',
    vibrant2: '#FFD23F',
    isGray: false,
  },
  'nightlife (near-black navy + pink + amber)': {
    dominant: '#131020',
    vibrant: '#FF4D97',
    vibrant2: '#FFB454',
    isGray: false,
  },
  'pastel (near-white + pale blue)': {
    dominant: '#F7F7F5',
    vibrant: '#E0F2FE',
    vibrant2: null,
    isGray: false,
  },
  'black poster + blue art': {
    dominant: '#0A0A0A',
    vibrant: '#2F80ED',
    vibrant2: null,
    isGray: false,
  },
  'cream + yellow': {
    dominant: '#FDF6E3',
    vibrant: '#FDE68A',
    vibrant2: '#FF7A1C',
    isGray: false,
  },
  'organizer picked a non-default swatch': {
    dominant: '#131020',
    vibrant: '#FF4D97',
    vibrant2: '#FFB454',
    isGray: false,
    candidates: ['#FF4D97', '#FFB454', '#2EE6FF'],
    chosenAccent: '#2EE6FF',
  },
};

const THEMES = ['wash', 'dark'] as const;

describe('deriveThemeVars contrast guardrails', () => {
  for (const [name, palette] of Object.entries(PALETTES)) {
    for (const theme of THEMES) {
      describe(`${theme} × ${name}`, () => {
        const vars = deriveThemeVars(theme, palette)!;

        it('derives a theme at all', () => {
          expect(vars).not.toBeNull();
        });

        it('body ink ≥ 12:1 on the ground', () => {
          expect(
            contrast(vars['--foreground'], vars['--background'])
          ).toBeGreaterThanOrEqual(12);
        });

        it('muted text ≥ 4.5:1 on every emitted surface', () => {
          for (const surface of [
            '--background',
            '--card',
            '--muted',
            '--secondary',
          ]) {
            expect(
              contrast(vars['--muted-foreground'], vars[surface])
            ).toBeGreaterThanOrEqual(4.5);
          }
        });

        it('CTA label ≥ 4.5:1 on its fill', () => {
          expect(
            contrast(vars['--primary-foreground'], vars['--primary'])
          ).toBeGreaterThanOrEqual(4.5);
        });

        it('CTA fill (and so --ring) ≥ 3:1 against the ground', () => {
          expect(
            contrast(vars['--primary'], vars['--background'])
          ).toBeGreaterThanOrEqual(3);
          expect(vars['--ring']).toBe(vars['--primary']);
        });

        it('accent label ≥ 4.5:1 on the accent fill', () => {
          expect(
            contrast(vars['--accent-foreground'], vars['--accent'])
          ).toBeGreaterThanOrEqual(4.5);
        });
      });
    }
  }

  it('the chosen swatch leads the CTA instead of the auto-pick', () => {
    const palette = PALETTES['organizer picked a non-default swatch'];
    for (const theme of THEMES) {
      const hue = parseFloat(
        deriveThemeVars(theme, palette)!['--primary'].split(' ')[0]
      );
      expect(Math.abs(hue - 189)).toBeLessThan(25); // #2EE6FF cyan, not pink
    }
  });

  it('a grayscale-dominant poster still themes in its art color, not red', () => {
    // Grayscale reports hue 0 (red) — without the guard, a maroon stage.
    const vars = deriveThemeVars('dark', PALETTES['black poster + blue art'])!;
    const hue = parseFloat(vars['--background'].split(' ')[0]);
    expect(Math.abs(hue - 213)).toBeLessThan(30); // #2F80ED's hue family
  });

  it('returns null (brand theme) for off, missing, and unusable palettes', () => {
    const gray: FlyerPalette = {
      dominant: '#111111',
      vibrant: null,
      vibrant2: null,
      isGray: true,
    };
    expect(deriveThemeVars('off', PALETTES['cream + yellow'])).toBeNull();
    expect(deriveThemeVars('wash', null)).toBeNull();
    expect(deriveThemeVars('wash', gray)).toBeNull();
    expect(deriveThemeVars('dark', gray)).toBeNull();
    expect(themeAvailable(gray)).toBe(false);
    expect(themeAvailable(null)).toBe(false);
    expect(themeAvailable(PALETTES['cream + yellow'])).toBe(true);
  });
});
