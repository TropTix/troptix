import { CheckCircle2, Circle } from 'lucide-react';
import type { PayoutSetupState } from '@troptix/api';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function SetupChecklistCard({ setup }: { setup: PayoutSetupState }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Set up payouts</CardTitle>
        <CardDescription>
          Two steps with the TropTix team unlock payout requests. Your balances
          are already tracked above.
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
          Your bank details are collected during setup and held at our bank —
          TropTix never stores them.
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
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
