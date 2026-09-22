import { CheckCircle2, Circle } from 'lucide-react';
import type { ConnectSetup, PayoutSetupState } from '@troptix/api';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { BankStep } from './BankStep';

/**
 * `connect` is null when the Stripe rail is off for this viewer or the page
 * is read-only; the bank step then shows the manual-rail copy only.
 */
export function SetupChecklistCard({
  setup,
  connect = null,
}: {
  setup: PayoutSetupState;
  connect?: ConnectSetup | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Set up payouts</CardTitle>
        <CardDescription>
          Two steps unlock payout requests. Your balances are already tracked
          above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ChecklistStep done={setup.meetingDone} title="Meet with TropTix">
          A short call to cover terms, timing, and where the money goes.{' '}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href="mailto:info@usetroptix.com?subject=Payout setup"
          >
            Contact us to schedule it.
          </a>
        </ChecklistStep>
        <ChecklistStep
          done={setup.bankLinked}
          title="Connect your bank account"
        >
          {setup.bankLinked ? (
            connect?.accountId ? (
              'Connected through Stripe.'
            ) : (
              'Your bank details are held at our bank — TropTix never stores them.'
            )
          ) : connect ? (
            <BankStep state={connect.state} />
          ) : (
            'Your bank details are collected during setup and held at our bank — TropTix never stores them.'
          )}
        </ChecklistStep>
      </CardContent>
    </Card>
  );
}

function ChecklistStep({
  done,
  title,
  children,
}: {
  done: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      ) : (
        <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
