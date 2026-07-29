import {
  deriveThemeVars,
  leadColor,
  themeAvailable,
  tripletContrast,
} from './flyerTheme';
import type { FlyerPalette } from '@troptix/api';

// Holds every emitted pairing to the module's promised WCAG ratios, across
// adversarial palettes where naive derivation is known to fail.

const PALETTES: Record<string, FlyerPalette> = {
  'seeded wash (wine + red + gold)': {
    dominant: '#7A1E2B',
    candidates: ['#FF4757', '#FFD23F', '#7A1E2B'],
  },
  'nightlife (near-black navy + pink + amber)': {
    dominant: '#131020',
    candidates: ['#FF4D97', '#FFB454'],
  },
  'pastel (near-white + pale blue)': {
    dominant: '#F7F7F5',
    candidates: ['#E0F2FE'],
  },
  'black poster + blue art': {
    dominant: '#0A0A0A',
    candidates: ['#2F80ED'],
  },
  'cream + yellow': {
    dominant: '#FDF6E3',
    candidates: ['#FDE68A', '#FF7A1C'],
  },
  'organizer picked a non-default swatch': {
    dominant: '#131020',
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
            tripletContrast(vars['--foreground'], vars['--background'])
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
              tripletContrast(vars['--muted-foreground'], vars[surface])
            ).toBeGreaterThanOrEqual(4.5);
          }
        });

        it('CTA label ≥ 4.5:1 on its fill', () => {
          expect(
            tripletContrast(vars['--primary-foreground'], vars['--primary'])
          ).toBeGreaterThanOrEqual(4.5);
        });

        it('CTA fill (and so --ring) ≥ 3:1 against the ground', () => {
          expect(
            tripletContrast(vars['--primary'], vars['--background'])
          ).toBeGreaterThanOrEqual(3);
          expect(vars['--ring']).toBe(vars['--primary']);
        });

        it('accent label ≥ 4.5:1 on the accent fill', () => {
          expect(
            tripletContrast(vars['--accent-foreground'], vars['--accent'])
          ).toBeGreaterThanOrEqual(4.5);
        });
      });
    }
  }

  it('the chosen swatch leads the CTA instead of the auto-pick', () => {
    const palette = PALETTES['organizer picked a non-default swatch'];
    expect(leadColor(palette)).toBe('#2EE6FF');
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
    const gray: FlyerPalette = { dominant: '#111111', candidates: [] };
    expect(deriveThemeVars('off', PALETTES['cream + yellow'])).toBeNull();
    expect(deriveThemeVars('wash', null)).toBeNull();
    expect(deriveThemeVars('wash', gray)).toBeNull();
    expect(deriveThemeVars('dark', gray)).toBeNull();
    expect(themeAvailable(gray)).toBe(false);
    expect(themeAvailable(null)).toBe(false);
    expect(themeAvailable(PALETTES['cream + yellow'])).toBe(true);
  });
});
