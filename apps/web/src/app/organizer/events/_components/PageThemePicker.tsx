'use client';

import type { EventPageTheme, FlyerPalette } from '@troptix/api';
import { deriveThemeVars, themeAvailable } from '@/lib/flyerTheme';
import { cn } from '@/lib/utils';

// The organizer-facing page-theme control: three fixed treatments, never a
// color picker. Wash/dark disable themselves (with the reason) until a flyer
// with usable color is uploaded; the dots preview the actual derived theme.

const OPTIONS: {
  value: EventPageTheme;
  label: string;
  blurb: string;
}[] = [
  { value: 'off', label: 'Classic', blurb: 'The standard TropTix look.' },
  {
    value: 'wash',
    label: 'Tinted wash',
    blurb: 'A light page tinted from your flyer.',
  },
  {
    value: 'dark',
    label: 'Poster dark',
    blurb: 'A dark page built around your flyer.',
  },
];

function PreviewDots({
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
    : ['hsl(var(--background))', 'hsl(var(--primary))', 'hsl(var(--accent))'];
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
}) {
  const usable = themeAvailable(palette);
  // Three distinct reasons a treatment is off, told apart honestly: no flyer
  // at all, a flyer we have never analyzed (pre-existing events), and a flyer
  // that was analyzed and genuinely has no usable color.
  const analyzed = palette !== null;
  const unavailableReason = !hasFlyer
    ? 'Upload a flyer to enable this.'
    : !analyzed
      ? "This flyer hasn't been analyzed yet."
      : 'Your flyer has no usable color for this.';

  return (
    <div className="space-y-2">
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
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {unavailable ? unavailableReason : opt.blurb}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {hasFlyer && !analyzed && onAnalyze && (
        <button
          type="button"
          onClick={onAnalyze}
          disabled={disabled || analyzing}
          className="text-xs font-medium text-primary underline underline-offset-2 disabled:opacity-50"
        >
          {analyzing ? 'Analyzing flyer…' : 'Analyze flyer colors'}
        </button>
      )}
    </div>
  );
}
