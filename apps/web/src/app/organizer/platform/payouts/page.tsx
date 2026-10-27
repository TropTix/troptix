import { notFound, redirect } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { Shield } from 'lucide-react';
import {
  getConnectStates,
  listPayoutOrganizations,
  listPayoutRequests,
  readPlatformPayoutBalance,
  reconcileStripePayouts,
} from '@troptix/api/server';
import type { PayoutMismatch, PlatformPayoutBalance } from '@troptix/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatCents } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import prisma from '@/server/prisma';
import { payoutClients } from '@/server/lib/stripePayouts';
import { PayoutSetupPanel } from './_components/PayoutSetupPanel';
import { PlatformRequestsTable } from './_components/PlatformRequestsTable';

// Walks every transfer and outbound payment in the window, so a few minutes
// stale beats two Stripe round-trips per page view. The cron runs the same check daily.
const reconcileCached = unstable_cache(
  () => reconcileStripePayouts(prisma, payoutClients),
  ['payout-reconciliation'],
  { revalidate: 300 }
);

export default async function PlatformPayoutsPage() {
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }
  if (!user.isPlatformOwner) {
    notFound();
  }

  const actor = userToActor(user);
  // Stripe being down must not take the queue down with it.
  const unavailable = (error: unknown) => {
    console.error('[PlatformPayouts] Stripe read failed:', error);
    return null;
  };
  const [requests, organizations, balance, mismatchList] = await Promise.all([
    listPayoutRequests(prisma, actor),
    listPayoutOrganizations(prisma, actor),
    readPlatformPayoutBalance(prisma, payoutClients, actor).catch(unavailable),
    reconcileCached().catch(unavailable),
  ]);
  const connectStates = getConnectStates(organizations);
  const mismatches = Object.fromEntries(
    (mismatchList ?? []).map((mismatch) => [mismatch.requestId, mismatch])
  );

  const rank = (status: string) => (status === 'REQUESTED' ? 0 : 1);
  const openFirst = [...requests].sort(
    (a, b) => rank(a.status) - rank(b.status)
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Platform Payouts
            </h1>
            <p className="text-muted-foreground">
              Payout requests and setup across all organizations
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-sm">
          Platform Admin
        </Badge>
      </div>

      <BalanceHeader balance={balance} mismatches={mismatchList} />
      <PlatformRequestsTable requests={openFirst} mismatches={mismatches} />
      <PayoutSetupPanel
        organizations={organizations}
        connectStates={connectStates}
      />
    </div>
  );
}

/**
 * The money before the click (plan decision 18): Stripe never retries a
 * failed transfer once funds arrive, so a shortfall has to show here.
 */
function BalanceHeader({
  balance,
  mismatches,
}: {
  balance: PlatformPayoutBalance | null;
  mismatches: PayoutMismatch[] | null;
}) {
  const short =
    balance !== null && balance.availableCents < balance.openRequestsCents;
  return (
    <Card className={cn(short && 'border-warning/40 bg-warning/5')}>
      <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-3 text-sm">
        <Stat
          label="Stripe balance available"
          value={balance ? formatCents(balance.availableCents) : 'Unavailable'}
        />
        <Stat
          label="Open Stripe requests"
          value={balance ? formatCents(balance.openRequestsCents) : '—'}
        />
        <div className="space-y-0.5 text-muted-foreground">
          <p>
            {balance === null
              ? "Couldn't reach Stripe. Refresh before sending."
              : short
                ? 'Short: wait for the next sweep to leave the floor, or top up, before sending.'
                : 'Enough to send every open Stripe request.'}
          </p>
          <p>
            {mismatches === null
              ? 'Reconciliation unavailable; check Stripe by hand before sending.'
              : mismatches.length === 0
                ? 'Transfers and requests agree.'
                : `${mismatches.length} ${mismatches.length === 1 ? 'request disagrees' : 'requests disagree'} with Stripe; see the flags below.`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}
