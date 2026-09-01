import { getPayouts } from '@troptix/api/server';
import { Banknote, Clock, Wallet } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCents } from '@/lib/dateUtils';
import { requireOrganizerActor } from '@/server/actor';
import prisma from '@/server/prisma';
import { RequestPayoutCard } from './_components/RequestPayoutCard';
import { RequestsTable } from './_components/RequestsTable';
import { SetupChecklistCard } from './_components/SetupChecklistCard';

export default async function OrganizerPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ viewAs?: string }>;
}) {
  const actor = await requireOrganizerActor();
  const { viewAs } = await searchParams;

  const payouts = await getPayouts(prisma, actor, {
    viewAsOrganizerUserId: viewAs,
  });
  const { setup, policy } = payouts;

  const holdbackLine = policy.releaseAtSale
    ? `Earnings are available as tickets sell; ${policy.holdbackPercent}% is held until ${policy.holdbackDays} days after each event ends.`
    : `Earnings become available when an event ends; ${policy.holdbackPercent}% is held for ${policy.holdbackDays} more days.`;

  const hasOpenRequest = payouts.requests.some(
    (request) => request.status === 'REQUESTED'
  );

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Payouts</h1>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Available"
          value={formatCents(payouts.availableCents)}
          hint="Ready to request now"
          icon={<Wallet className="h-5 w-5 text-muted-foreground" />}
        />
        <StatCard
          label="Pending"
          value={formatCents(payouts.pendingCents)}
          hint={holdbackLine}
          icon={<Clock className="h-5 w-5 text-muted-foreground" />}
        />
        <StatCard
          label="Paid out"
          value={formatCents(payouts.paidOutCents)}
          hint="All time"
          icon={<Banknote className="h-5 w-5 text-muted-foreground" />}
        />
      </section>

      {setup.complete ? (
        <RequestPayoutCard
          availableCents={payouts.availableCents}
          hasOpenRequest={hasOpenRequest}
          holdbackLine={holdbackLine}
        />
      ) : (
        <SetupChecklistCard setup={setup} />
      )}

      <RequestsTable requests={payouts.requests} />
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
        <div>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl">{value}</CardTitle>
        </div>
        <span className="shrink-0">{icon}</span>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
