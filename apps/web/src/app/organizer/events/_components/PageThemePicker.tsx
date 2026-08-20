'use client';

import type { EventPageTheme, FlyerPalette } from '@troptix/api';
import { deriveThemeVars, leadColor, themeAvailable } from '@/lib/flyerTheme';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Three fixed treatments, never a color picker — the system owns contrast.

export const THEME_LABELS = {
  off: 'Classic',
  wash: 'Tinted wash',
  dark: 'Poster dark',
} satisfies Record<EventPageTheme, string>;

const OPTIONS: {
  value: EventPageTheme;
  blurb: string;
}[] = [
  { value: 'off', blurb: 'The standard TropTix look.' },
  { value: 'wash', blurb: 'A light page tinted from your flyer.' },
  { value: 'dark', blurb: 'A dark page built around your flyer.' },
];

export function PreviewDots({
  theme,
  palette,
}: {
  theme: EventPageTheme;
  palette: FlyerPalette | null;
}) {
  const vars = deriveThemeVars(theme, palette);
  // 'off' previews the brand tokens the page already renders with.
  const colors = vars
    ? [vars['--background'], vars['--primary'], vars['--accent']].map(
        (v) => `hsl(${v})`
      )
    : ['var(--background)', 'var(--primary)', 'var(--accent)'];
  return (
    <span className="flex gap-1" aria-hidden>
      {colors.map((c, i) => (
        <span
          key={i}
          className="h-4 w-4 rounded-full border border-black/10"
          style={{ background: c }}
        />
      ))}
    </span>
  );
}

export function PageThemePicker({
  value,
  onChange,
  palette,
  hasFlyer,
  disabled,
  analyzing,
  onAnalyze,
  onPickAccent,
}: {
  value: EventPageTheme;
  onChange: (theme: EventPageTheme) => void;
  palette: FlyerPalette | null;
  hasFlyer: boolean;
  disabled?: boolean;
  /** True while extraction is running (upload or the Analyze action). */
  analyzing?: boolean;
  /** Extract from the stored flyer — for events saved before analysis existed. */
  onAnalyze?: () => void;
  /** The organizer picked which extracted color leads the theme. */
  onPickAccent?: (hex: string) => void;
}) {
  const usable = themeAvailable(palette);
  const candidates = palette?.candidates ?? [];
  const lead = leadColor(palette);
  const analyzed = palette !== null;
  const unavailableReason = !hasFlyer
    ? 'Upload a flyer to enable this.'
    : !analyzed
      ? "This flyer hasn't been analyzed yet."
      : 'Your flyer has no usable color for this.';

  return (
    <div className="space-y-3">
      {usable && candidates.length > 1 && onPickAccent && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Lead color — from your flyer
          </p>
          <div className="flex gap-2" role="radiogroup" aria-label="Lead color">
            {candidates.map((hex) => (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={hex === lead}
                aria-label={`Lead color ${hex}`}
                disabled={disabled || value === 'off'}
                onClick={() => onPickAccent(hex)}
                className={cn(
                  'h-8 w-8 rounded-full border border-black/10 transition-shadow',
                  hex === lead && 'ring-2 ring-primary ring-offset-2',
                  (disabled || value === 'off') &&
                    'cursor-not-allowed opacity-50'
                )}
                style={{ background: hex }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2" role="radiogroup" aria-label="Page theme">
        {OPTIONS.map((opt) => {
          const needsPalette = opt.value !== 'off';
          const unavailable = needsPalette && !usable;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={value === opt.value}
              disabled={disabled || unavailable}
              onClick={() => onChange(opt.value)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                value === opt.value
                  ? 'border-primary ring-1 ring-primary'
                  : 'border-input hover:bg-muted/40',
                (disabled || unavailable) && 'cursor-not-allowed opacity-50'
              )}
            >
              <PreviewDots theme={opt.value} palette={palette} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {THEME_LABELS[opt.value]}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {unavailable ? unavailableReason : opt.blurb}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {hasFlyer && !analyzed && onAnalyze && (
        <Button
          type="button"
          variant="link"
          onClick={onAnalyze}
          disabled={disabled || analyzing}
          className="h-auto p-0 text-xs"
        >
          {analyzing ? 'Analyzing flyer…' : 'Analyze flyer colors'}
        </Button>
      )}
    </div>
  );
}
