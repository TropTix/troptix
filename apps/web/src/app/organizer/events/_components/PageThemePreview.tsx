'use client';

import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import type { EventPageTheme, FlyerPalette } from '@troptix/api';
import { themeStyle } from '@/lib/flyerTheme';
import { getDateRangeFormatter } from '@/lib/dateUtils';
import { priceLabelFor } from '@/lib/utils';

// Miniature of the public page: same derivation, CSS variables, and label
// formatters, so it stays a true preview by construction.

export function PageThemePreview({
  theme,
  palette,
  name,
  imageUrl,
  startsAt,
  endsAt,
  venue,
  /** Ticket prices in dollars; empty when none exist yet. */
  prices,
}: {
  theme: EventPageTheme;
  palette: FlyerPalette | null;
  name: string;
  imageUrl: string | null;
  startsAt: Date;
  endsAt: Date;
  venue: string;
  prices: number[];
}) {
  const priceLabel = priceLabelFor(
    prices.length ? Math.round(Math.min(...prices) * 100) : null
  );

  return (
    <div>
      <div
        style={themeStyle(theme, palette)}
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
                {getDateRangeFormatter(startsAt, endsAt)}
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
