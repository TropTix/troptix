'use client';

import { Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function SuccessTicket({
  event,
  email,
  tickets,
  onDone,
}: {
  event: { name: string; organizer: string; startDate: string };
  email: string | null;
  tickets: { id: string; ticketTypeName: string | null }[];
  onDone: () => void;
}) {
  const qty = tickets.length;
  const first = tickets[0];
  const dateLabel = new Date(event.startDate).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex-1 overflow-y-auto px-5 py-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
        <Check className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-2xl font-extrabold tracking-tight">
        You&rsquo;re going!
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {qty} {qty === 1 ? 'ticket' : 'tickets'} sent to{' '}
        {email ? (
          <strong className="text-foreground">{email}</strong>
        ) : (
          'your email'
        )}
      </p>

      {first && (
        <div className="mx-auto mt-6 max-w-[300px] overflow-hidden rounded-2xl border border-border shadow-sm">
          <div className="bg-primary px-4 py-4 text-left text-primary-foreground">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
              {event.organizer}
            </div>
            <div className="mt-0.5 text-base font-extrabold">{event.name}</div>
            <div className="text-xs opacity-90">{dateLabel}</div>
          </div>
          <div className="flex flex-col items-center gap-2 bg-card px-4 py-5">
            <QRCodeSVG value={first.id} size={132} />
            <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {first.ticketTypeName ?? 'Ticket'} ·{' '}
              {first.id.slice(0, 8).toUpperCase()}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onDone}
        className="mt-6 h-12 w-full rounded-2xl bg-primary font-bold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Done
      </button>
    </div>
  );
}
