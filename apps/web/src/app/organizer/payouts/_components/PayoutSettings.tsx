import {
  Banknote,
  CheckCircle2,
  Circle,
  Clock,
  Info,
  Mail,
} from 'lucide-react';
import type { ConnectSetup, PayoutSetupState } from '@troptix/api';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BankStep } from './BankStep';
import { SETUP_STEP_COUNT, setupStepsDone } from './SetupChecklistCard';

export function PayoutSettings({
  setup,
  connect,
  holdbackLine,
  viaStripe,
}: {
  setup: PayoutSetupState;
  connect: ConnectSetup | null;
  holdbackLine: string;
  viaStripe: boolean;
}) {
  const done = setupStepsDone(setup);
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b py-6">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Payout requirements</CardTitle>
            <p className="text-sm text-muted-foreground">
              {setup.complete
                ? 'All set. You can request payouts any time you have a balance.'
                : 'Two steps with the TropTix team unlock payout requests.'}
            </p>
          </div>
          {setup.complete ? (
            <Badge className="bg-success/10 text-success">Payouts on</Badge>
          ) : (
            <Badge variant="outline">
              {done} of {SETUP_STEP_COUNT}
            </Badge>
          )}
        </CardHeader>
        <Requirement done={setup.meetingDone} title="Meet with TropTix">
          {setup.meetingDone ? (
            'Completed. Covered terms, timing, and where the money goes.'
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
        </Requirement>
        <Requirement done={setup.bankLinked} title="Bank account" last>
          <BankStep setup={setup} connect={connect} showDashboard />
        </Requirement>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How payouts work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5 text-sm">
            <HowItem icon={<Clock />}>{holdbackLine}</HowItem>
            <HowItem icon={<Banknote />}>
              {viaStripe
                ? 'Payouts go to the bank account on your Stripe account.'
                : 'Payouts go to the bank account you set up with TropTix.'}
            </HowItem>
            <HowItem icon={<Info />}>
              One open request at a time. Cancel it any time before it&apos;s
              paid.
            </HowItem>
          </CardContent>
        </Card>
        <Card className="gap-1.5 py-5">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Questions about a payout?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href="mailto:info@usetroptix.com?subject=Payouts"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Mail className="size-4" />
              info@usetroptix.com
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Requirement({
  done,
  title,
  last = false,
  children,
}: {
  done: boolean;
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-3.5 px-6 py-5 ${last ? '' : 'border-b'}`}
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
      {done && (
        <span className="shrink-0 text-sm text-muted-foreground">Done</span>
      )}
    </div>
  );
}

function HowItem({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 shrink-0 text-muted-foreground [&>svg]:size-4">
        {icon}
      </span>
      <span>{children}</span>
    </div>
  );
}
