'use client';

import { useState, useTransition } from 'react';
import { Clock, ExternalLink } from 'lucide-react';
import type { ConnectState } from '@troptix/api';

import { Button } from '@/components/ui/button';
import { startStripeOnboarding } from '../_actions/payoutActions';

type Country = 'us' | 'other';

/**
 * The bank step's five states, derived live from Stripe (plan decision 4).
 * The country choice is never stored: "United States" creates the account,
 * anything else only reveals the manual-rail copy.
 */
export function BankStep({ state }: { state: ConnectState }) {
  const [country, setCountry] = useState<Country | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const connect = () =>
    startTransition(async () => {
      setError(null);
      const result = await startStripeOnboarding();
      if (result && !result.success) {
        setError(result.error ?? 'Something went wrong.');
      }
    });

  if (state === 'pending') {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        Stripe is reviewing your details. This usually takes a day or two;
        we&apos;ll mark this step done for you.
      </p>
    );
  }

  if (state === 'unavailable') {
    return (
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t reach Stripe just now. Refresh in a moment to see where
        your setup stands.
      </p>
    );
  }

  if (
    state === 'in_progress' ||
    state === 'needs_updates' ||
    state === 'active'
  ) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {state === 'needs_updates'
            ? 'Stripe needs updated information before payouts can continue.'
            : state === 'active'
              ? 'Stripe has verified your account. This step will show as done shortly.'
              : 'Stripe still needs a few details from you.'}
        </p>
        {state !== 'active' && (
          <Button size="sm" onClick={connect} disabled={isPending}>
            {isPending
              ? 'Opening Stripe…'
              : state === 'needs_updates'
                ? 'Update with Stripe'
                : 'Finish setting up with Stripe'}
            <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Where is the bank account you want paid?
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={country === 'us' ? 'default' : 'outline'}
          onClick={() => setCountry('us')}
        >
          United States
        </Button>
        <Button
          type="button"
          size="sm"
          variant={country === 'other' ? 'default' : 'outline'}
          onClick={() => setCountry('other')}
        >
          Jamaica or elsewhere
        </Button>
      </div>
      {country === 'us' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            We need a U.S. address, an SSN or EIN, and a U.S. bank account to
            verify with Stripe. TropTix never sees your bank details. Takes
            about five minutes.
          </p>
          <Button size="sm" onClick={connect} disabled={isPending}>
            {isPending ? 'Opening Stripe…' : 'Connect with Stripe'}
            <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
      {country === 'other' && (
        <p className="text-sm text-muted-foreground">
          We set this up together during your payout meeting. Your bank details
          are held at our bank — TropTix never stores them.
        </p>
      )}
    </div>
  );
}
