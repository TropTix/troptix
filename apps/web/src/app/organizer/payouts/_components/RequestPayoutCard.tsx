'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatCents } from '@/lib/dateUtils';
import { requestPayout } from '../_actions/payoutActions';

export function RequestPayoutCard({
  availableCents,
  hasOpenRequest,
  holdbackLine,
}: {
  availableCents: number;
  hasOpenRequest: boolean;
  holdbackLine: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((availableCents / 100).toFixed(2));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const disabled = hasOpenRequest || availableCents <= 0;
  const amountCents = Math.round(Number.parseFloat(amount || '0') * 100);

  const submit = () => {
    setError(null);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setError('Enter an amount above $0.');
      return;
    }
    if (amountCents > availableCents) {
      setError('The amount is more than your available balance.');
      return;
    }
    startTransition(async () => {
      const result = await requestPayout({
        amountCents,
        note: note.trim() || undefined,
      });
      if (result.success) {
        setOpen(false);
        setNote('');
      } else {
        setError(result.error ?? 'Something went wrong.');
      }
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base">Request a payout</CardTitle>
          <CardDescription>
            {hasOpenRequest
              ? 'Your open request is being processed — one at a time.'
              : holdbackLine}
          </CardDescription>
        </div>
        {!open && (
          <Button
            disabled={disabled}
            onClick={() => {
              setAmount((availableCents / 100).toFixed(2));
              setOpen(true);
            }}
          >
            Request payout
          </Button>
        )}
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="payout-amount">
              Amount (up to {formatCents(availableCents)})
            </Label>
            <Input
              id="payout-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max={(availableCents / 100).toFixed(2)}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="payout-note">Note (optional)</Label>
            <Textarea
              id="payout-note"
              placeholder="Anything the TropTix team should know"
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button disabled={isPending} onClick={submit}>
              {isPending
                ? 'Requesting…'
                : `Request ${formatCents(amountCents)}`}
            </Button>
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
