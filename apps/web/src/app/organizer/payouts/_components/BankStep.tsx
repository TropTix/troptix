import { Clock } from 'lucide-react';
import type { ConnectSetup, PayoutSetupState } from '@troptix/api';

import { ConnectBankDialog } from './ConnectBankDialog';
import { StripeActionButton } from './StripeActionButton';

/**
 * The bank step's copy and action, derived from the mirrored Stripe state
 * (ADR 0032). `connect` is null when the Stripe rail is off for this viewer;
 * the step then shows the manual-rail copy only. `readOnly` keeps the copy
 * and drops the actions, which would act on the viewer's own organization.
 * A recipient (Global Payouts) has no dashboard and is paid in its own
 * currency; the copy says so.
 */
export function BankStep({
  setup,
  connect,
  globalPayouts = false,
  readOnly = false,
  showDashboard = false,
}: {
  setup: PayoutSetupState;
  connect: ConnectSetup | null;
  globalPayouts?: boolean;
  readOnly?: boolean;
  showDashboard?: boolean;
}) {
  if (!connect || connect.state === 'manual') {
    if (setup.bankLinked) {
      return (
        <p>
          Your bank details are held at our bank — TropTix never stores them.
        </p>
      );
    }
    if (!connect || readOnly) {
      return (
        <p>
          Your bank details are collected during setup and held at our bank —
          TropTix never stores them.
        </p>
      );
    }
    return (
      <div className="space-y-2">
        <p>
          Add your bank securely through Stripe — TropTix never stores your
          details.
        </p>
        <ConnectBankDialog globalPayouts={globalPayouts} />
      </div>
    );
  }

  const recipient = connect.kind === 'GLOBAL_PAYOUTS';

  switch (connect.state) {
    case 'pending':
      return (
        <p className="flex items-start gap-2">
          <Clock className="mt-0.5 size-4 shrink-0" />
          Stripe is reviewing your details. This usually takes a day or two;
          we&apos;ll mark this step done for you.
        </p>
      );
    case 'active':
      return (
        <div className="space-y-2">
          <p>
            {recipient
              ? 'Connected through Stripe. Payouts are converted to your currency at Stripe’s rate and land in your bank within about a week of our sending.'
              : 'Connected through Stripe. Payouts land in your bank on Stripe’s schedule, usually within two business days of our sending.'}
          </p>
          {showDashboard && !readOnly && !recipient && (
            <StripeActionButton action="dashboard" variant="outline" size="sm">
              Open Stripe dashboard
            </StripeActionButton>
          )}
        </div>
      );
    case 'in_progress':
      return (
        <div className="space-y-2">
          <p>Stripe still needs a few details from you.</p>
          {!readOnly && (
            <StripeActionButton action="onboarding" size="sm">
              Finish setting up with Stripe
            </StripeActionButton>
          )}
        </div>
      );
    case 'needs_updates':
      return (
        <div className="space-y-2">
          <p>Stripe needs updated information before payouts can continue.</p>
          {!readOnly && (
            <StripeActionButton action="onboarding" size="sm">
              Update with Stripe
            </StripeActionButton>
          )}
        </div>
      );
  }
}
