import React from 'react';
import { redirect } from 'next/navigation';
import { getUserFromIdTokenCookie } from '@/server/authUser';

export default async function OrganizerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserFromIdTokenCookie();
  if (!user) {
    redirect('/auth/signin');
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <main className="flex-1 md:container px-4 py-8 mt-16">{children}</main>
      <div className="md:hidden h-16"></div>
    </div>
  );
}
