import { notFound, redirect } from 'next/navigation';
import { listGrants, NotFoundError } from '@troptix/api/server';
import { FeatureFlag, type GrantsView } from '@troptix/api';
import prisma from '@/server/prisma';
import { getServerUser } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import { isFlagEnabled } from '@/server/lib/featureFlags';
import { AccessCodesManager } from './_components/AccessCodesManager';

export default async function EventAccessCodesPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ viewAs?: string }>;
}) {
  const user = await getServerUser();
  if (!user) {
    redirect('/auth/signin');
  }
  if (
    !(await isFlagEnabled(FeatureFlag.GUEST_ACCESS, {
      id: user.uid,
      email: user.email,
    }))
  ) {
    notFound();
  }

  const { eventId } = await params;
  const { viewAs } = await searchParams;

  let view: GrantsView;
  try {
    view = await listGrants(prisma, userToActor(user), eventId, {
      viewAsOrganizerUserId: viewAs,
    });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Access codes</h1>
        <p className="text-sm text-muted-foreground">
          Codes unlock hidden ticket types and can cap uses, tickets per order
          and how long they work.
        </p>
      </div>
      <AccessCodesManager eventId={eventId} view={view} />
    </div>
  );
}
