import Link from 'next/link';
import type { ConnectReturnOutcome } from '@troptix/api';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const COPY: Record<ConnectReturnOutcome, { title: string; body: string }> = {
  active: {
    title: 'Your bank account is connected',
    body: 'Request a payout whenever you have an available balance.',
  },
  pending: {
    title: 'Thanks — Stripe is reviewing your details',
    body: "We'll finish this step for you once they're done, usually within a day or two.",
  },
  incomplete: {
    title: 'You can pick up where you left off any time',
    body: 'Stripe saved what you entered. Finish the remaining details when you are ready.',
  },
};

export function ConnectReturnBanner({
  outcome,
}: {
  outcome: ConnectReturnOutcome;
}) {
  const copy = COPY[outcome];
  return (
    <Alert variant="info">
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>{copy.body}</span>
        <Link
          href="/organizer/payouts"
          className="text-sm underline underline-offset-2"
        >
          Dismiss
        </Link>
      </AlertDescription>
    </Alert>
  );
}
