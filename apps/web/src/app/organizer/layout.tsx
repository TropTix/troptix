import React from 'react';
import { redirect } from 'next/navigation';
import prisma from '@/server/prisma';
import {
  isPlatformOwner,
  listOwnedOrganizations,
  resolveOrganizerScope,
} from '@troptix/api/server';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { userToActor } from '@/server/actor';
import { OrganizationBar } from './_components/OrganizationBar';
import { OrganizationRequired } from './_components/OrganizationRequired';

export default async function OrganizerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }

  const actor = userToActor(user);
  const [organizations, scope, platformOwner] = await Promise.all([
    listOwnedOrganizations(prisma, actor),
    resolveOrganizerScope(prisma, actor),
    isPlatformOwner(prisma, user.uid),
  ]);

  if (organizations.length === 0 && !platformOwner) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <main className="flex-1 md:container px-4 py-8 mt-16">
          <OrganizationRequired />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <main className="flex-1 md:container px-4 py-8 mt-16">
        <OrganizationBar
          organizations={organizations}
          currentId={scope.organizationId}
        />
        {children}
      </main>
      <div className="md:hidden h-16"></div>
    </div>
  );
}
