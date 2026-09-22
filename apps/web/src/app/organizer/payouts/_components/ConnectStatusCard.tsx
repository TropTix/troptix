'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import type { ConnectState } from '@troptix/api';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  openStripeDashboard,
  startStripeOnboarding,
} from '../_actions/payoutActions';

/** Shown once setup is complete on the Stripe rail: the dashboard link, or the warning. */
export function ConnectStatusCard({ state }: { state: ConnectState }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = (action: () => Promise<{ success: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (result && !result.success) {
        setError(result.error ?? 'Something went wrong.');
      }
    });

  if (state === 'needs_updates') {
    return (
      <Card className="border-destructive/40">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Stripe needs updated information
            </CardTitle>
            <CardDescription>
              You can still request a payout, but we can&apos;t send it until
              Stripe is satisfied.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => run(startStripeOnboarding)}
            disabled={isPending}
          >
            {isPending ? 'Opening Stripe…' : 'Update with Stripe'}
            <ExternalLink className="ml-2 h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        {error && (
          <CardContent>
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        )}
      </Card>
    );
  }

  if (state !== 'active') return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Bank connected through Stripe
          </CardTitle>
          <CardDescription>
            Payouts land in your bank on Stripe&apos;s schedule, usually within
            two business days of our sending. See deposits, change your bank
            account, or download statements in your Stripe dashboard.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => run(openStripeDashboard)}
          disabled={isPending}
        >
          {isPending ? 'Opening…' : 'Open Stripe dashboard'}
          <ExternalLink className="ml-2 h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      {error && (
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      )}
    </Card>
  );
}
