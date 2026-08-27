'use client';

import { useEffect, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from '@stripe/react-stripe-js/checkout';
import { Spinner } from '@/components/ui/spinner';
import { getFormattedCurrency } from '@/lib/utils';
import type { EventDetail } from '@troptix/api';

const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = loadStripe(stripeKey ?? '');

const money = (cents: number) => getFormattedCurrency(cents / 100);

type PaymentSummary = {
  items: {
    name: string;
    quantity: number;
    unitPriceCents: number;
    feesCents: number;
  }[];
  subtotalCents: number;
  feesCents: number;
  totalCents: number;
};

function OrderSummary({
  event,
  summary,
}: {
  event: EventDetail;
  summary: PaymentSummary;
}) {
  const start = new Date(event.startsAt);
  const dateLine = `${start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })} · ${start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
  return (
    <div className="mb-4 rounded-xl border bg-muted/30 p-4">
      <p className="font-bold leading-tight">{event.name}</p>
      <p className="text-sm text-muted-foreground">{dateLine}</p>
      <div className="mt-3 space-y-1 text-sm">
        {summary.items.map((item, i) => (
          <div key={`${item.name}-${i}`} className="flex justify-between">
            <span>
              {item.quantity} × {item.name}
            </span>
            <span>{money(item.quantity * item.unitPriceCents)}</span>
          </div>
        ))}
        {summary.feesCents > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Service fees</span>
            <span>{money(summary.feesCents)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t pt-2 font-semibold">
          <span>Total</span>
          <span>{money(summary.totalCents)}</span>
        </div>
      </div>
    </div>
  );
}

// The server holds 2 min past the buyer's countdown (ADR 0018), so a payment
// submitted at zero can still settle and webhook before the hold releases.
const CLIENT_HOLD_BUFFER_MS = 2 * 60_000;

function useCountdown(expiresAt: string): number {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000))
  );
  useEffect(() => {
    const tick = () =>
      setSecondsLeft(
        Math.max(
          0,
          Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)
        )
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return secondsLeft;
}

function PaymentInner({
  event,
  summary,
  expiresAt,
  onExpired,
  onBack,
}: {
  event: EventDetail;
  summary: PaymentSummary;
  expiresAt: string;
  onExpired: () => void;
  onBack: () => void;
}) {
  const checkoutState = useCheckoutElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const softDeadline = new Date(
    new Date(expiresAt).getTime() - CLIENT_HOLD_BUFFER_MS
  ).toISOString();
  const secondsLeft = useCountdown(softDeadline);
  const expired = secondsLeft <= 0;

  // Never expire while confirm() is in flight — that tears down the UI
  // mid-charge. If the confirm fails, `submitting` clears and this re-runs.
  useEffect(() => {
    if (expired && !submitting) onExpired();
  }, [expired, submitting, onExpired]);

  if (checkoutState.type === 'loading') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Spinner className="size-12 text-primary" />
        <p className="text-base">Loading payment…</p>
      </div>
    );
  }
  if (checkoutState.type === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-lg font-bold">We couldn&rsquo;t start checkout</p>
        <p className="text-sm text-muted-foreground">
          {checkoutState.error.message}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-2 text-sm font-semibold text-primary"
        >
          Go back
        </button>
      </div>
    );
  }

  const { checkout } = checkoutState;
  const mm = Math.floor(secondsLeft / 60);
  const ss = String(secondsLeft % 60).padStart(2, '0');

  async function pay() {
    setSubmitting(true);
    setError(null);
    // On success, Stripe redirects to the Session's return_url
    // (/e/[eventId]?reservation=…); the resume path there finalizes the order.
    const result = await checkout.confirm();
    if (result.type === 'error') {
      setError(result.error.message ?? 'Your payment could not be processed.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
      <div className="mb-3 flex items-center justify-between pr-8 text-sm">
        <button
          type="button"
          onClick={onBack}
          className="font-semibold text-muted-foreground"
        >
          Back
        </button>
        <span
          className={
            secondsLeft <= 60
              ? 'font-semibold text-destructive'
              : 'text-muted-foreground'
          }
        >
          Held for {mm}:{ss}
        </span>
      </div>

      <OrderSummary event={event} summary={summary} />

      <PaymentElement />

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <button
        type="button"
        onClick={pay}
        disabled={submitting || expired || !checkout.canConfirm}
        className="mt-4 w-full rounded-full bg-primary py-3 text-center font-semibold text-primary-foreground disabled:opacity-50"
      >
        {expired
          ? 'Hold expired'
          : submitting
            ? 'Processing…'
            : `Pay ${money(summary.totalCents)}`}
      </button>
    </div>
  );
}

export default function PaymentStep({
  clientSecret,
  event,
  summary,
  expiresAt,
  onExpired,
  onBack,
}: {
  clientSecret: string;
  event: EventDetail;
  summary: PaymentSummary;
  expiresAt: string;
  onExpired: () => void;
  onBack: () => void;
}) {
  return (
    <CheckoutElementsProvider stripe={stripePromise} options={{ clientSecret }}>
      <PaymentInner
        event={event}
        summary={summary}
        expiresAt={expiresAt}
        onExpired={onExpired}
        onBack={onBack}
      />
    </CheckoutElementsProvider>
  );
}
