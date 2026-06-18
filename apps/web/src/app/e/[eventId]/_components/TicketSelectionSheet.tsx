'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { getFormattedCurrency, cn } from '@/lib/utils';
import type { EventTicket } from '@troptix/api';

// Ticket-selection sheet (Stage 3, slice 1): a bottom sheet (shadcn Sheet),
// width-constrained so it reads as a centered card on desktop. Lists the public
// tiers with steppers and a running total. "Continue" is the commit seam —
// wiring it to createReservation + the reservation route is the next slice.
// See docs/plans/2026-06-event-page-redesign.md / PRD #348.

export type TicketSelection = Record<string, number>;

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
      <button
        type="button"
        aria-label="Remove one"
        disabled={value === 0}
        onClick={() => onChange(-1)}
        className="grid h-8 w-8 place-items-center rounded-full text-foreground transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="w-6 text-center text-sm font-bold tabular-nums">
        {value}
      </span>
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

export default function TicketSelectionSheet({
  open,
  onOpenChange,
  eventName,
  tickets,
  isFree,
  onCommit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventName: string;
  tickets: EventTicket[];
  isFree: boolean;
  onCommit: (selection: TicketSelection) => void;
}) {
  const [sel, setSel] = useState<TicketSelection>({});

  function adjust(id: string, delta: number, max: number) {
    setSel((prev) => {
      const qty = Math.max(0, Math.min(max, (prev[id] ?? 0) + delta));
      const next = { ...prev, [id]: qty };
      if (qty === 0) delete next[id];
      return next;
    });
  }

  const chosen = tickets.filter((t) => (sel[t.id] ?? 0) > 0);
  const qty = chosen.reduce((sum, t) => sum + sel[t.id], 0);
  const feesCents = chosen.reduce((sum, t) => sum + sel[t.id] * t.feesCents, 0);
  const totalCents = chosen.reduce(
    (sum, t) => sum + sel[t.id] * (t.priceCents + t.feesCents),
    0
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[85vh] flex-col gap-0 rounded-t-2xl border-border p-0"
      >
        {/* Width-constrained so it's a full-width sheet on mobile and a centered
            card on desktop. */}
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
          <SheetHeader className="space-y-0.5 border-b border-border px-5 py-4 text-left">
            <SheetTitle className="text-lg font-extrabold tracking-tight">
              {isFree ? 'Reserve your spot' : 'Choose tickets'}
            </SheetTitle>
            <SheetDescription className="truncate">
              {eventName}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {tickets.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No tickets are currently available.
              </p>
            )}
            {tickets.map((t) => {
              const q = sel[t.id] ?? 0;
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
                            adjust(t.id, delta, t.maxAllowedToAdd)
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
              onClick={() => onCommit(sel)}
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {qty === 0
                ? 'Select tickets to continue'
                : isFree
                  ? 'Complete RSVP'
                  : 'Continue'}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
