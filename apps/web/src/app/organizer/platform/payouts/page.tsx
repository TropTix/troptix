import { notFound, redirect } from 'next/navigation';
import { Shield } from 'lucide-react';
import {
  listPayoutOrganizations,
  listPayoutRequests,
} from '@troptix/api/server';
import { Badge } from '@/components/ui/badge';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import prisma from '@/server/prisma';
import { PayoutSetupPanel } from './_components/PayoutSetupPanel';
import { PlatformRequestsTable } from './_components/PlatformRequestsTable';

export default async function PlatformPayoutsPage() {
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }
  if (!user.isPlatformOwner) {
    notFound();
  }

  const actor = userToActor(user);
  const [requests, organizations] = await Promise.all([
    listPayoutRequests(prisma, actor),
    listPayoutOrganizations(prisma, actor),
  ]);

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

      <PlatformRequestsTable requests={openFirst} />
      <PayoutSetupPanel organizations={organizations} />
    </div>
  );
}
