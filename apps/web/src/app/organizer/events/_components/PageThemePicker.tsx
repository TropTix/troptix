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
}: {
  value: EventPageTheme;
  onChange: (theme: EventPageTheme) => void;
  palette: FlyerPalette | null;
  hasFlyer: boolean;
  disabled?: boolean;
}) {
  const usable = themeAvailable(palette);

  return (
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
                {unavailable
                  ? hasFlyer
                    ? 'Your flyer has no usable color for this.'
                    : 'Upload a flyer to enable this.'
                  : opt.blurb}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
