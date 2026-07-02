'use client';

import { useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/components/AuthProvider';
import { trpc } from '@/lib/trpc';
import type { EventDetail, ReservationContact } from '@troptix/api';
import SelectStep from './SelectStep';
import ContactStep from './ContactStep';
import PaymentStep from './PaymentStep';
import SuccessTicket from './SuccessTicket';

// Checkout orchestrator: owns the step machine + selection, calls the tRPC
// mutations/queries, and drives the presentational steps. Free RSVP completes
// inline; paid runs select → contact → payment (Checkout Session) → redirect,
// then the resume path (?reservation=) finalizes into success (ADR 0018).
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
  /** When set (from `?reservation=`), resume an in-flight checkout. */
  resumeReservationId?: string | null;
}) {
  const { user } = useAuth();
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
  // Guards the one-shot "resume found an unpaid hold → reopen payment" branch.
  const resumeReopenRef = useRef(false);

  const createReservation = trpc.checkout.createReservation.useMutation();
  const completeFree = trpc.checkout.completeFree.useMutation();
  const beginPayment = trpc.checkout.beginPayment.useMutation();
  const releaseReservation = trpc.checkout.release.useMutation();

  // Poll the server for the checkout outcome while finalizing (resume path).
  const polling = step === 'finalizing' && !!reservationId;
  const stateQuery = trpc.checkout.getCheckoutState.useQuery(
    { reservationId: reservationId ?? '' },
    { enabled: polling, refetchInterval: polling ? 1500 : false }
  );

  // Resume an in-flight checkout when opened with ?reservation= (post-payment
  // redirect, refresh, or 3DS return).
  useEffect(() => {
    if (open && resumeReservationId) {
      setReservationId(resumeReservationId);
      setStep('finalizing');
    }
  }, [open, resumeReservationId]);

  // Map the polled state onto the step machine.
  useEffect(() => {
    if (step !== 'finalizing' || !stateQuery.data) return;
    const state = stateQuery.data;
    if (state.kind === 'order') {
      setSuccessData({ orderId: state.orderId, tickets: state.tickets });
      setStep('success');
      // Mirror the free flow: nudge the confirmation email (idempotent).
      void fetch('/api/checkout/confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: state.orderId }),
      }).catch(() => {});
    } else if (state.kind === 'refunded') {
      setStep('refunded');
      // The webhook normally sends this, but the sync-fulfillment poll can be
      // what performs the refund (webhook slow/down) — nudge it here too
      // (idempotent: Resend dedupes on refund-<reservationId>).
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
      // Resumed onto an unpaid hold (e.g. refreshed the payment step before
      // paying) — reopen the Payment Element instead of spinning. beginPayment
      // reuses the still-open Session.
      resumeReopenRef.current = true;
      beginPayment
        .mutateAsync({ reservationId })
        .then((payment) => {
          setClientSecret(payment.clientSecret);
          setExpiresAt(payment.expiresAt);
          setPaymentSummary({
            items: payment.items,
            subtotalCents: payment.subtotalCents,
            feesCents: payment.feesCents,
            totalCents: payment.totalCents,
          });
          setStep('payment');
        })
        .catch(() => setStep('expired'));
    }
  }, [step, stateQuery.data, reservationId]);

  // After ~20s still finalizing, reassure the buyer without stopping the poll.
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
    createReservation.reset();
    completeFree.reset();
    beginPayment.reset();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
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
  // Free vs paid is a property of the selection, not the event — an event can
  // have both free and paid tiers.
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
      });
      heldReservationId = reservation.reservationId;
      if (reservation.items.every((g) => g.granted === 0)) {
        setLocalError('Sorry — these tickets just sold out.');
        if (heldReservationId) {
          releaseReservation.mutate({ reservationId: heldReservationId });
        }
        return;
      }

      if (isFree) {
        const order = await completeFree.mutateAsync({
          reservationId: reservation.reservationId,
        });
        setSuccessData({ orderId: order.orderId, tickets: order.tickets });
        setStep('success');
        void fetch('/api/checkout/confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.orderId }),
        }).catch(() => {});
        return;
      }

      // Paid: open a Checkout Session and move to the Payment Element.
      setReservationId(reservation.reservationId);
      setReservationParam(reservation.reservationId);
      const payment = await beginPayment.mutateAsync({
        reservationId: reservation.reservationId,
      });
      setClientSecret(payment.clientSecret);
      setExpiresAt(payment.expiresAt);
      setPaymentSummary({
        items: payment.items,
        subtotalCents: payment.subtotalCents,
        feesCents: payment.feesCents,
        totalCents: payment.totalCents,
      });
      setStep('payment');
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

  // Back from the Payment step: a reservation already exists, so re-entering
  // Contact would re-run createReservation (a duplicate hold in the normal flow,
  // or an empty-items validation error on a resumed load where `selection` is
  // gone). Instead release the hold and start fresh at ticket selection.
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
        className="flex h-[100dvh] w-full flex-col gap-0 border-0 p-0"
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
                isFree={isFree}
                eventName={event.name}
                onContinue={() => setStep('contact')}
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
                <Spinner text="Finalizing your tickets…" />
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
