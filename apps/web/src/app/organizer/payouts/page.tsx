import { notFound, redirect } from 'next/navigation';
import { getConnectSetup, getPayouts } from '@troptix/api/server';
import { connectReturnOutcomeSchema, FeatureFlag } from '@troptix/api';
import { Banknote, Clock, Wallet } from 'lucide-react';
import { isFlagEnabled } from '@/server/lib/featureFlags';
import { getServerUser } from '@/server/authUser';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCents } from '@/lib/dateUtils';
import { userToActor } from '@/server/actor';
import prisma from '@/server/prisma';
import { stripe } from '@/server/lib/stripe';
import { ConnectReturnBanner } from './_components/ConnectReturnBanner';
import { ConnectStatusCard } from './_components/ConnectStatusCard';
import { RequestPayoutCard } from './_components/RequestPayoutCard';
import { RequestsTable } from './_components/RequestsTable';
import { SetupChecklistCard } from './_components/SetupChecklistCard';

export default async function OrganizerPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ viewAs?: string; stripe?: string }>;
}) {
  const user = await getServerUser();
  if (!user) {
    redirect('/auth/signin');
  }
  // Email included so the staff release condition matches without PostHog
  // having seen this user before.
  const flagUser = { id: user.uid, email: user.email };
  const [payoutsEnabled, connectEnabled] = await Promise.all([
    isFlagEnabled(FeatureFlag.ORGANIZER_PAYOUTS, flagUser),
    isFlagEnabled(FeatureFlag.STRIPE_CONNECT_ONBOARDING, flagUser),
  ]);
  if (!payoutsEnabled) {
    notFound();
  }
  const actor = userToActor(user);

  const { viewAs, stripe: stripeParam } = await searchParams;

  // Writes never take a View-as target (the seam's rule), so the write
  // controls disappear when viewing another organizer — they would act on the
  // viewer's own organization, not the one on screen.
  const readOnly =
    Boolean(viewAs) && (actor.kind !== 'user' || viewAs !== actor.userId);

  const [payouts, connect] = await Promise.all([
    getPayouts(prisma, actor, { viewAsOrganizerUserId: viewAs }),
    connectEnabled
      ? getConnectSetup(prisma, stripe, actor, {
          viewAsOrganizerUserId: viewAs,
        })
      : Promise.resolve(null),
  ]);
  const { policy } = payouts;
  // The Connect read may have just stamped the gate; reflect it in this render.
  const bankLinked = payouts.setup.bankLinked || connect?.state === 'active';
  const setup = {
    ...payouts.setup,
    bankLinked,
    complete: payouts.setup.meetingDone && bankLinked,
  };
  const returnOutcome = connectReturnOutcomeSchema.safeParse(stripeParam);

  const holdbackLine = policy.releaseAtSale
    ? `Earnings are available as tickets sell; ${policy.holdbackPercent}% is held until ${policy.holdbackDays} days after each event ends.`
    : `Earnings become available when an event ends; ${policy.holdbackPercent}% is held for ${policy.holdbackDays} more days.`;

  const hasOpenRequest = payouts.requests.some(
    (request) => request.status === 'REQUESTED'
  );

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Payouts</h1>

      {connect && returnOutcome.success && (
        <ConnectReturnBanner outcome={returnOutcome.data} />
      )}

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
        !readOnly && (
          <>
            {connect && <ConnectStatusCard state={connect.state} />}
            <RequestPayoutCard
              availableCents={payouts.availableCents}
              hasOpenRequest={hasOpenRequest}
              holdbackLine={holdbackLine}
            />
          </>
        )
      ) : (
        <SetupChecklistCard setup={setup} connect={readOnly ? null : connect} />
      )}

      <RequestsTable requests={payouts.requests} readOnly={readOnly} />
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
