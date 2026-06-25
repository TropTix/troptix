'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/components/AuthProvider';
import { trpc } from '@/lib/trpc';
import type { EventDetail, ReservationContact } from '@troptix/api';
import SelectStep from './SelectStep';
import ContactStep from './ContactStep';
import SuccessTicket from './SuccessTicket';

// Checkout orchestrator: owns the step machine + selection, calls the tRPC
// mutations, and drives the presentational steps. Free RSVP completes here;
// paid stops at a "coming soon" note (payment is the next slice).
type Step = 'select' | 'contact' | 'comingSoon' | 'success';

const STEP_TITLE: Record<Step, string> = {
  select: 'Choose tickets',
  contact: 'Your details',
  comingSoon: 'Coming soon',
  success: "You're going",
};

export default function CheckoutSheet({
  open,
  onOpenChange,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventDetail;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('select');
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const isFree = event.fromPriceCents === 0;

  const createReservation = trpc.checkout.createReservation.useMutation();
  const completeFree = trpc.checkout.completeFree.useMutation();

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      // Reset after the close animation so the content doesn't flicker.
      setTimeout(() => {
        setStep('select');
        setSelection({});
        setLocalError(null);
        createReservation.reset();
        completeFree.reset();
      }, 250);
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

  async function handleContact(contact: ReservationContact) {
    setLocalError(null);
    if (!isFree) {
      setStep('comingSoon');
      return;
    }
    try {
      const reservation = await createReservation.mutateAsync({
        eventId: event.id,
        items: chosen.map((t) => ({
          ticketTypeId: t.id,
          quantity: selection[t.id],
        })),
        contact,
      });
      if (reservation.items.every((g) => g.granted === 0)) {
        setLocalError('Sorry — these tickets just sold out.');
        return;
      }
      await completeFree.mutateAsync({
        reservationId: reservation.reservationId,
      });
      setStep('success');
    } catch {
      // tRPC errors surface via the mutation errors below.
    }
  }

  const submitError =
    localError ??
    createReservation.error?.message ??
    completeFree.error?.message ??
    null;
  const submitting = createReservation.isPending || completeFree.isPending;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[85vh] flex-col gap-0 rounded-t-2xl border-border p-0"
      >
        <SheetTitle className="sr-only">{STEP_TITLE[step]}</SheetTitle>
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
          {step === 'comingSoon' && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <p className="text-lg font-bold">Card checkout is coming soon</p>
              <p className="text-sm text-muted-foreground">
                Paid tickets aren&rsquo;t available on this page yet.
              </p>
              <button
                type="button"
                onClick={() => setStep('contact')}
                className="mt-2 text-sm font-semibold text-primary"
              >
                Back
              </button>
            </div>
          )}
          {step === 'success' && completeFree.data && (
            <SuccessTicket
              event={event}
              email={completeFree.data.email}
              tickets={completeFree.data.tickets}
              onDone={() => handleOpenChange(false)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
