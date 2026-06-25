'use client';

import { Minus, Plus } from 'lucide-react';
import { getFormattedCurrency, cn } from '@/lib/utils';
import type { EventTicket } from '@troptix/api';

const money = (cents: number) => getFormattedCurrency(cents / 100);

function Stepper({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (delta: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
      {/* Minus + count are hidden until the first ticket is added, then slide in. */}
      {value > 0 && (
        <div className="flex items-center gap-1 duration-200 animate-in fade-in slide-in-from-right-2">
          <button
            type="button"
            aria-label="Remove one"
            onClick={() => onChange(-1)}
            className="grid h-8 w-8 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center text-sm font-bold tabular-nums">
            {value}
          </span>
        </div>
      )}
      <button
        type="button"
        aria-label="Add one"
        disabled={value >= max}
        onClick={() => onChange(1)}
        className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-30"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function SelectStep({
  tickets,
  selection,
  onAdjust,
  qty,
  totalCents,
  feesCents,
  isFree,
  eventName,
  onContinue,
}: {
  tickets: EventTicket[];
  selection: Record<string, number>;
  onAdjust: (id: string, delta: number, max: number) => void;
  qty: number;
  totalCents: number;
  feesCents: number;
  isFree: boolean;
  eventName: string;
  onContinue: () => void;
}) {
  return (
    <>
      <div className="space-y-0.5 border-b border-border px-5 py-4">
        <h2 className="text-lg font-extrabold tracking-tight">
          {isFree ? 'Reserve your spot' : 'Choose tickets'}
        </h2>
        <p className="truncate text-sm text-muted-foreground">{eventName}</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {tickets.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No tickets are currently available.
          </p>
        )}
        {tickets.map((t) => {
          const q = selection[t.id] ?? 0;
          const unavailable = t.maxAllowedToAdd === 0;
          return (
            <div
              key={t.id}
              className={cn(
                'rounded-xl border p-4 transition-colors',
                q > 0 ? 'border-primary bg-primary/5' : 'border-border',
                unavailable && 'opacity-60'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{t.name}</div>
                  {t.description && (
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      {t.description}
                    </div>
                  )}
                  <div className="mt-1.5 text-sm">
                    <span className="font-bold">
                      {t.priceCents === 0 ? 'Free' : money(t.priceCents)}
                    </span>
                    {t.feesCents > 0 && (
                      <span className="text-muted-foreground">
                        {' '}
                        + {money(t.feesCents)} fees
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 pt-0.5">
                  {unavailable ? (
                    <span className="text-xs font-semibold text-muted-foreground">
                      Unavailable
                    </span>
                  ) : (
                    <Stepper
                      value={q}
                      max={t.maxAllowedToAdd}
                      onChange={(delta) =>
                        onAdjust(t.id, delta, t.maxAllowedToAdd)
                      }
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <p className="pt-1 text-xs text-muted-foreground">
          Prices include fees. Tickets are held for 10 minutes once you
          continue.
        </p>
      </div>

      <div className="border-t border-border px-5 py-4">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <div className="text-sm font-semibold">Total</div>
            <div className="text-xs text-muted-foreground">
              {qty > 0
                ? `${qty} ${qty === 1 ? 'ticket' : 'tickets'} · incl. ${money(
                    feesCents
                  )} fees`
                : 'incl. fees'}
            </div>
          </div>
          <div className="text-xl font-extrabold tabular-nums">
            {money(totalCents)}
          </div>
        </div>
        <button
          type="button"
          disabled={qty === 0}
          onClick={onContinue}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {qty === 0
            ? 'Select tickets to continue'
            : isFree
              ? 'RSVP'
              : 'Continue'}
        </button>
      </div>
    </>
  );
}
