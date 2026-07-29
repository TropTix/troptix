'use client';

import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { EventPageTheme, FlyerPalette } from '@troptix/api';
import { deriveThemeVars } from '@/lib/flyerTheme';

// A miniature of the public event page, themed exactly the way the page will
// be: same derivation, same CSS variables, scoped to this box. Re-derives on
// every prop change, so swatch and treatment picks show up as they're clicked.

export function PageThemePreview({
  theme,
  palette,
  name,
  imageUrl,
  dateLabel,
  venue,
  priceLabel,
}: {
  theme: EventPageTheme;
  palette: FlyerPalette | null;
  name: string;
  imageUrl: string | null;
  dateLabel: string;
  venue: string;
  priceLabel: string;
}) {
  const vars = (deriveThemeVars(theme, palette) ?? undefined) as
    | CSSProperties
    | undefined;

  return (
    <div>
      <div
        style={vars}
        className="overflow-hidden rounded-lg border border-input"
      >
        <div className="bg-background p-3 text-foreground">
          <div className="flex gap-3">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="h-16 w-16 shrink-0 rounded-md border border-border bg-muted" />
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold">
                {name || 'Your event'}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                {dateLabel}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {venue || 'Venue'}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-card-foreground">
            <span className="truncate text-xs font-bold">{priceLabel}</span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
              Get Tickets
              <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Live preview of your public event page.
      </p>
    </div>
  );
}
