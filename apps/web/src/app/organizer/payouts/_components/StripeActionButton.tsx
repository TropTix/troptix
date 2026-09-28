'use client';

import { useState, useTransition, type ComponentProps } from 'react';
import { ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  openStripeDashboard,
  startStripeOnboarding,
} from '../_actions/payoutActions';

const ACTIONS = {
  onboarding: startStripeOnboarding,
  dashboard: openStripeDashboard,
};

/** Runs a Stripe redirect action; the button stays put on failure and shows why. */
export function StripeActionButton({
  action,
  children,
  className,
  ...props
}: {
  action: keyof typeof ACTIONS;
  children: React.ReactNode;
} & Pick<ComponentProps<typeof Button>, 'variant' | 'size' | 'className'>) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      setError(null);
      const result = await ACTIONS[action]();
      if (result && !result.success) {
        setError(result.error ?? 'Something went wrong.');
      }
    });

  return (
    <div className={className}>
      <Button onClick={run} disabled={isPending} {...props}>
        {isPending ? 'Opening Stripe…' : children}
        <ExternalLink />
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
