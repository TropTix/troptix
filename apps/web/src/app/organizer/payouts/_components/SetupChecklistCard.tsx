import { CheckCircle2, Circle } from 'lucide-react';
import type { ConnectSetup, PayoutSetupState } from '@troptix/api';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { BankStep } from './BankStep';

export const SETUP_STEP_COUNT = 2;

export function setupStepsDone(setup: PayoutSetupState) {
  return Number(setup.meetingDone) + Number(setup.bankLinked);
}

export function SetupChecklistCard({
  setup,
  connect,
}: {
  setup: PayoutSetupState;
  connect: ConnectSetup | null;
}) {
  const done = setupStepsDone(setup);
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Set up payouts</CardTitle>
          <CardDescription>
            Two steps with the TropTix team unlock payout requests. Your
            balances are already tracked below.
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
          <span className="text-xs text-muted-foreground">
            {done} of {SETUP_STEP_COUNT} done
          </span>
          <Progress
            value={(done / SETUP_STEP_COUNT) * 100}
            className="h-1.5 w-36"
          />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <StepCard
          done={setup.meetingDone}
          active={!setup.meetingDone}
          title="Meet with TropTix"
        >
          {setup.meetingDone ? (
            'Terms, timing, and where the money goes.'
          ) : (
            <>
              A short call to cover terms, timing, and where the money goes.{' '}
              <a
                className="underline underline-offset-2 hover:text-foreground"
                href="mailto:info@usetroptix.com?subject=Payout setup"
              >
                Contact us to schedule it.
              </a>
            </>
          )}
        </StepCard>
        <StepCard
          done={setup.bankLinked}
          active={setup.meetingDone && !setup.bankLinked}
          title="Connect your bank account"
        >
          <BankStep setup={setup} connect={connect} />
        </StepCard>
      </CardContent>
    </Card>
  );
}

function StepCard({
  done,
  active,
  title,
  children,
}: {
  done: boolean;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg p-4',
        done ? 'bg-muted/50' : 'border',
        active && 'border-primary/30'
      )}
    >
      {done ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
      ) : (
        <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{title}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}
