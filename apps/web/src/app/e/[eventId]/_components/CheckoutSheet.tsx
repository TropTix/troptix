'use client';

import { useEffect, useRef, useState } from 'react';
import { usePostHog } from 'posthog-js/react';
import { ANALYTICS_EVENTS } from '@troptix/api/analytics';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/components/AuthProvider';
import { trpc } from '@/lib/trpc';
import type {
  BeginPaymentResponse,
  EventDetail,
  ReservationContact,
} from '@troptix/api';
import SelectStep from './SelectStep';
import ContactStep from './ContactStep';
import PaymentStep from './PaymentStep';
import SuccessTicket from './SuccessTicket';

type Step =
  | 'select'
  | 'contact'
  | 'payment'
  | 'finalizing'
  | 'success'
  | 'expired'
  | 'refunded';

const STEP_TITLE: Record<Step, string> = {
  select: 'Choose tickets',
  contact: 'Your details',
  payment: 'Payment',
  finalizing: 'Finalizing',
  success: "You're going",
  expired: 'Hold expired',
  refunded: 'Payment refunded',
};

type SuccessData = {
  orderId: string;
  tickets: { id: string; ticketTypeName: string | null }[];
};

function setReservationParam(reservationId: string | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (reservationId) url.searchParams.set('reservation', reservationId);
  else url.searchParams.delete('reservation');
  window.history.replaceState(null, '', url.toString());
}

export default function CheckoutSheet({
  open,
  onOpenChange,
  event,
  resumeReservationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventDetail;
  resumeReservationId?: string | null;
}) {
  const { user } = useAuth();
  const posthog = usePostHog();
  const [step, setStep] = useState<Step>('select');
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  // Authoritative order summary from the server (beginPayment). The selection-
  // derived total/items are gone on a resumed load, so the Payment step uses this.
  const [paymentSummary, setPaymentSummary] = useState<{
    items: {
      name: string;
      quantity: number;
      unitPriceCents: number;
      feesCents: number;
    }[];
    subtotalCents: number;
    feesCents: number;
    totalCents: number;
  } | null>(null);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [slowFinalize, setSlowFinalize] = useState(false);
  const resumeReopenRef = useRef(false);

  // The browser's PostHog identity, sent with the hold so the server-side
  // conversion capture joins this person/session (see contracts/analytics.ts).
  function analyticsIds() {
    try {
      const distinctId = posthog.get_distinct_id();
      const sessionId = posthog.get_session_id();
      return {
        ...(distinctId ? { distinctId } : {}),
        ...(sessionId ? { sessionId } : {}),
      };
    } catch {
      return undefined;
    }
  }

  function capture(name: string, props?: Record<string, unknown>) {
    posthog.capture(name, { event_id: event.id, ...props });
  }

  // `resumed` is always an explicit boolean: an absent key doesn't match
  // `resumed = false` filters in PostHog.
  function openPayment(
    payment: BeginPaymentResponse,
    forReservationId: string,
    resumed: boolean
  ) {
    setClientSecret(payment.clientSecret);
    setExpiresAt(payment.expiresAt);
    setPaymentSummary({
      items: payment.items,
      subtotalCents: payment.subtotalCents,
      feesCents: payment.feesCents,
      totalCents: payment.totalCents,
    });
    capture(ANALYTICS_EVENTS.checkoutPaymentStarted, {
      reservation_id: forReservationId,
      total_cents: payment.totalCents,
      resumed,
    });
    setStep('payment');
  }

  // The success URL keeps ?reservation=, so the paid path replays on every
  // reload — capture the order once, mirroring the server's alreadyProcessed gate.
  function finishCheckout(order: SuccessData, orderType: 'FREE' | 'PAID') {
    setSuccessData(order);
    const dedupeKey = `tt_checkout_completed_${order.orderId}`;
    let alreadyCaptured = false;
    try {
      alreadyCaptured = !!localStorage.getItem(dedupeKey);
      localStorage.setItem(dedupeKey, '1');
    } catch {
      // Storage unavailable (private mode) — fall back to capturing.
    }
    if (!alreadyCaptured) {
      capture(ANALYTICS_EVENTS.checkoutCompleted, {
        order_id: order.orderId,
        order_type: orderType,
        ticket_count: order.tickets.length,
      });
    }
    setStep('success');
    // Nudge the confirmation email (idempotent server-side).
    void fetch('/api/checkout/confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.orderId }),
    }).catch(() => {});
  }

  const createReservation = trpc.checkout.createReservation.useMutation();
  const completeFree = trpc.checkout.completeFree.useMutation();
  const beginPayment = trpc.checkout.beginPayment.useMutation();
  const releaseReservation = trpc.checkout.release.useMutation();

  const polling = step === 'finalizing' && !!reservationId;
  const stateQuery = trpc.checkout.getCheckoutState.useQuery(
    { reservationId: reservationId ?? '' },
    { enabled: polling, refetchInterval: polling ? 1500 : false }
  );

  // Consume-once, not the live searchParam: the payment step writes ?reservation=
  // via replaceState, and Next's echo of it would bounce payment → finalizing → payment.
  const resumeTargetRef = useRef(resumeReservationId ?? null);
  useEffect(() => {
    if (!open || !resumeTargetRef.current) return;
    setReservationId(resumeTargetRef.current);
    resumeTargetRef.current = null;
    setStep('finalizing');
  }, [open]);

  useEffect(() => {
    if (step !== 'finalizing' || !stateQuery.data) return;
    const state = stateQuery.data;
    if (state.kind === 'order') {
      finishCheckout(
        { orderId: state.orderId, tickets: state.tickets },
        'PAID'
      );
    } else if (state.kind === 'refunded') {
      setStep('refunded');
      // The poll can be what performs the refund (webhook slow/down) — nudge the
      // notice here too; idempotent, Resend dedupes on refund-<reservationId>.
      if (reservationId) {
        void fetch('/api/checkout/refund-notice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reservationId }),
        }).catch(() => {});
      }
    } else if (state.kind === 'expired') {
      setStep('expired');
    } else if (
      state.kind === 'held' &&
      reservationId &&
      !resumeReopenRef.current
    ) {
      // Resumed onto an unpaid hold — reopen payment instead of spinning;
      // beginPayment reuses the still-open Session.
      resumeReopenRef.current = true;
      beginPayment
        .mutateAsync({ reservationId })
        .then((payment) => openPayment(payment, reservationId, true))
        .catch(() => {
          expiredReasonRef.current = 'payment_reopen_failed';
          setStep('expired');
        });
    }
  }, [step, stateQuery.data, reservationId]);

  // Expired/refunded are set from several places — capture on the step
  // transition so every path counts once.
  const capturedStepRef = useRef<Step | null>(null);
  const expiredReasonRef = useRef<'hold_expired' | 'payment_reopen_failed'>(
    'hold_expired'
  );
  useEffect(() => {
    if (capturedStepRef.current === step) return;
    capturedStepRef.current = step;
    if (step === 'expired') {
      capture(ANALYTICS_EVENTS.checkoutExpired, {
        reason: expiredReasonRef.current,
      });
    }
    if (step === 'refunded') capture(ANALYTICS_EVENTS.checkoutRefunded);
  }, [step]);

  useEffect(() => {
    if (step !== 'finalizing') {
      setSlowFinalize(false);
      return;
    }
    const id = setTimeout(() => setSlowFinalize(true), 20_000);
    return () => clearTimeout(id);
  }, [step]);

  function resetState() {
    setStep('select');
    setSelection({});
    setLocalError(null);
    setReservationId(null);
    setClientSecret(null);
    setExpiresAt(null);
    setPaymentSummary(null);
    setSuccessData(null);
    setSlowFinalize(false);
    resumeReopenRef.current = false;
    expiredReasonRef.current = 'hold_expired';
    createReservation.reset();
    completeFree.reset();
    beginPayment.reset();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      if (step === 'select' || step === 'contact' || step === 'payment') {
        capture(ANALYTICS_EVENTS.checkoutAbandoned, { checkout_step: step });
      }
      setReservationParam(null);
      setTimeout(resetState, 250);
    }
  }

  function adjust(id: string, delta: number, max: number) {
    setSelection((prev) => {
      const q = Math.max(0, Math.min(max, (prev[id] ?? 0) + delta));
      const next = { ...prev, [id]: q };
      if (q === 0) delete next[id];
      return next;
    });
  }

  const chosen = event.tickets.filter((t) => (selection[t.id] ?? 0) > 0);
  const qty = chosen.reduce((sum, t) => sum + selection[t.id], 0);
  const feesCents = chosen.reduce(
    (sum, t) => sum + selection[t.id] * t.feesCents,
    0
  );
  const totalCents = chosen.reduce(
    (sum, t) => sum + selection[t.id] * (t.priceCents + t.feesCents),
    0
  );
  const isFree = totalCents === 0;

  async function handleContact(contact: ReservationContact) {
    setLocalError(null);
    let heldReservationId: string | undefined;
    try {
      const reservation = await createReservation.mutateAsync({
        eventId: event.id,
        items: chosen.map((t) => ({
          ticketTypeId: t.id,
          quantity: selection[t.id],
        })),
        contact,
        analytics: analyticsIds(),
      });
      heldReservationId = reservation.reservationId;
      if (reservation.items.every((g) => g.granted === 0)) {
        capture(ANALYTICS_EVENTS.checkoutSoldOut, { ticket_count: qty });
        setLocalError('Sorry — these tickets just sold out.');
        if (heldReservationId) {
          releaseReservation.mutate({ reservationId: heldReservationId });
        }
        return;
      }
      capture(ANALYTICS_EVENTS.checkoutReservationCreated, {
        reservation_id: reservation.reservationId,
        ticket_count: reservation.items.reduce((sum, g) => sum + g.granted, 0),
        total_cents: reservation.totalCents,
        was_adjusted: reservation.wasAdjusted,
        is_free: isFree,
      });

      if (isFree) {
        const order = await completeFree.mutateAsync({
          reservationId: reservation.reservationId,
        });
        finishCheckout(
          { orderId: order.orderId, tickets: order.tickets },
          'FREE'
        );
        return;
      }

      setReservationId(reservation.reservationId);
      setReservationParam(reservation.reservationId);
      const payment = await beginPayment.mutateAsync({
        reservationId: reservation.reservationId,
      });
      openPayment(payment, reservation.reservationId, false);
    } catch {
      // Errors surface via the mutation error banners below. Hand back the hold
      // if we took one but never reached payment (no-op if it converted).
      if (heldReservationId && step !== 'payment') {
        releaseReservation.mutate({ reservationId: heldReservationId });
        setReservationParam(null);
      }
    }
  }

  function startOver() {
    setReservationParam(null);
    resetState();
  }

  // Re-entering Contact would re-run createReservation — a duplicate hold, or an
  // empty-items error on a resumed load — so release the hold and restart at select.
  function backFromPayment() {
    if (reservationId) releaseReservation.mutate({ reservationId });
    startOver();
  }

  const submitError =
    localError ??
    createReservation.error?.message ??
    completeFree.error?.message ??
    beginPayment.error?.message ??
    null;
  const submitting =
    createReservation.isPending ||
    completeFree.isPending ||
    beginPayment.isPending;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex h-dvh w-full flex-col gap-0 border-0 p-0 sm:inset-0 sm:m-auto sm:h-[85vh] sm:max-w-md sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetTitle className="sr-only">{STEP_TITLE[step]}</SheetTitle>
        {step === 'success' && successData ? (
          <SuccessTicket
            event={event}
            orderId={successData.orderId}
            tickets={successData.tickets}
          />
        ) : (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-hidden">
            {step === 'select' && (
              <SelectStep
                tickets={event.tickets}
                selection={selection}
                onAdjust={adjust}
                qty={qty}
                totalCents={totalCents}
                feesCents={feesCents}
                eventName={event.name}
                onContinue={() => {
                  capture(ANALYTICS_EVENTS.checkoutTicketsSelected, {
                    ticket_count: qty,
                    total_cents: totalCents,
                    fees_cents: feesCents,
                    is_free: isFree,
                  });
                  setStep('contact');
                }}
              />
            )}
            {step === 'contact' && (
              <ContactStep
                defaultValues={{
                  firstName: user?.firstName ?? '',
                  lastName: user?.lastName ?? '',
                  email: user?.email ?? '',
                }}
                isFree={isFree}
                submitting={submitting}
                error={submitError}
                eventName={event.name}
                onBack={() => setStep('select')}
                onSubmit={handleContact}
              />
            )}
            {step === 'payment' &&
              clientSecret &&
              expiresAt &&
              paymentSummary && (
                <PaymentStep
                  clientSecret={clientSecret}
                  event={event}
                  summary={paymentSummary}
                  expiresAt={expiresAt}
                  onExpired={() => setStep('expired')}
                  onBack={backFromPayment}
                />
              )}
            {step === 'finalizing' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <Spinner className="size-12 text-primary" />
                <p className="text-base">Finalizing your tickets…</p>
                {slowFinalize && (
                  <p className="text-sm text-muted-foreground">
                    This is taking longer than expected — your tickets will
                    arrive by email shortly.
                  </p>
                )}
              </div>
            )}
            {step === 'expired' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                <p className="text-lg font-bold">Your hold expired</p>
                <p className="text-sm text-muted-foreground">
                  We couldn&rsquo;t keep your tickets reserved. Start over to
                  try again.
                </p>
                <button
                  type="button"
                  onClick={startOver}
                  className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
                >
                  Start over
                </button>
              </div>
            )}
            {step === 'refunded' && (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                <p className="text-lg font-bold">Payment refunded</p>
                <p className="text-sm text-muted-foreground">
                  These tickets sold out while your payment was processing, so
                  we refunded you in full. It may take a few days to appear on
                  your statement.
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className="mt-3 text-sm font-semibold text-primary"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
