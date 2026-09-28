'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import type { OrganizerPayoutRequest } from '@troptix/api';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LocalTime } from '@/components/LocalTime';
import { formatCents } from '@/lib/dateUtils';
import { cancelPayoutRequest } from '../_actions/payoutActions';

export function OpenRequestCard({
  request,
  readOnly,
}: {
  request: OrganizerPayoutRequest;
  readOnly: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const cancel = () =>
    startTransition(async () => {
      setError(null);
      const result = await cancelPayoutRequest(request.id);
      if (!result.success) {
        setError(result.error ?? 'Something went wrong.');
      }
    });

  return (
    <Card className="border-primary/30">
      <CardContent className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto]">
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">Open request</p>
          <p className="text-3xl font-semibold leading-none">
            {formatCents(request.amountCents)}
          </p>
          <p className="text-xs text-muted-foreground">
            Submitted <LocalTime at={request.createdAt} />
          </p>
        </div>
        <ol className="flex items-center gap-2">
          <Step state="done" label="Requested" />
          <Connector done />
          <Step state="current" label="Processing" />
          <Connector />
          <Step state="todo" label="Paid to bank" />
        </ol>
        {!readOnly && (
          <div className="lg:text-right">
            <Button
              variant="outline"
              size="sm"
              onClick={cancel}
              disabled={isPending}
            >
              {isPending ? 'Cancelling…' : 'Cancel request'}
            </Button>
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Step({
  state,
  label,
}: {
  state: 'done' | 'current' | 'todo';
  label: string;
}) {
  return (
    <li className="flex shrink-0 flex-col items-center gap-1.5">
      {state === 'done' ? (
        <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3.5" />
        </span>
      ) : state === 'current' ? (
        <span className="flex size-7 items-center justify-center rounded-full border-2 border-primary">
          <span className="size-2 rounded-full bg-primary" />
        </span>
      ) : (
        <span className="size-7 rounded-full border" />
      )}
      <span
        className={
          state === 'todo'
            ? 'text-xs text-muted-foreground'
            : 'text-xs font-medium'
        }
      >
        {label}
      </span>
    </li>
  );
}

function Connector({ done = false }: { done?: boolean }) {
  return (
    <li
      aria-hidden
      className={`mb-[18px] h-0.5 flex-1 ${done ? 'bg-primary' : 'bg-border'}`}
    />
  );
}
