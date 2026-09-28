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

type ActionResult = { success: boolean; error?: string } | void;

/**
 * Runs a Stripe redirect action; the button stays put on failure and shows
 * why. `action` names a shared action; `run` is for one that needs input.
 */
export function StripeActionButton({
  action,
  run,
  children,
  className,
  ...props
}: {
  action?: keyof typeof ACTIONS;
  run?: () => Promise<ActionResult>;
  children: React.ReactNode;
} & Pick<
  ComponentProps<typeof Button>,
  'variant' | 'size' | 'className' | 'disabled'
>) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const start = () =>
    startTransition(async () => {
      setError(null);
      const result = await (run ?? ACTIONS[action ?? 'onboarding'])();
      if (result && !result.success) {
        setError(result.error ?? 'Something went wrong.');
      }
    });

  return (
    <div className={className}>
      <Button {...props} onClick={start} disabled={isPending || props.disabled}>
        {isPending ? 'Opening Stripe…' : children}
        <ExternalLink />
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
