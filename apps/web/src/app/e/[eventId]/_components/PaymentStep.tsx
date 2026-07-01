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

// One Stripe.js instance for the module (loadStripe is memoized upstream too).
const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = loadStripe(stripeKey ?? '');

const money = (cents: number) => getFormattedCurrency(cents / 100);

// The server holds 2 min past the buyer's countdown (ADR 0018): showing a
// deadline earlier than the true `expiresAt` gives a payment submitted right at
// zero time to settle + have its webhook delivered before the hold releases.
const CLIENT_HOLD_BUFFER_MS = 2 * 60_000;

/** Whole seconds left until `expiresAt`, clamped at 0. */
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
  totalCents,
  expiresAt,
  onExpired,
  onBack,
}: {
  totalCents: number;
  expiresAt: string;
  onExpired: () => void;
  onBack: () => void;
}) {
  const checkoutState = useCheckoutElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Count down to the soft (client) deadline, ahead of the server's hold.
  const softDeadline = new Date(
    new Date(expiresAt).getTime() - CLIENT_HOLD_BUFFER_MS
  ).toISOString();
  const secondsLeft = useCountdown(softDeadline);
  const expired = secondsLeft <= 0;

  // Once the hold lapses, kick the parent to the "start over" step.
  useEffect(() => {
    if (expired) onExpired();
  }, [expired, onExpired]);

  if (checkoutState.type === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner text="Loading payment…" />
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
      <div className="mb-3 flex items-center justify-between text-sm">
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
              ? 'font-semibold text-red-600'
              : 'text-muted-foreground'
          }
        >
          Held for {mm}:{ss}
        </span>
      </div>

      <PaymentElement />

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

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
            : `Pay ${money(totalCents)}`}
      </button>
    </div>
  );
}

/**
 * Paid checkout surface (ADR 0018): the Checkout Session's Payment Element with
 * a visible hold countdown. Renders inside the CheckoutSheet. Success redirects
 * to the Session return_url — the parent never sees a success callback here.
 */
export default function PaymentStep({
  clientSecret,
  totalCents,
  expiresAt,
  onExpired,
  onBack,
}: {
  clientSecret: string;
  totalCents: number;
  expiresAt: string;
  onExpired: () => void;
  onBack: () => void;
}) {
  return (
    <CheckoutElementsProvider stripe={stripePromise} options={{ clientSecret }}>
      <PaymentInner
        totalCents={totalCents}
        expiresAt={expiresAt}
        onExpired={onExpired}
        onBack={onBack}
      />
    </CheckoutElementsProvider>
  );
}
