import { cache } from 'react';
import { notFound } from 'next/navigation';
import prisma from '@/server/prisma';
import { getOrganizationBySlug, NotFoundError } from '@troptix/api/server';
import OrganizationProfile from './_components/OrganizationProfile';

// ISR self-heal: app-driven changes revalidate this path on demand, but changes
// made outside the app (SQL backfills/edits) would otherwise stay stale forever.
export const revalidate = 3600;

const loadOrg = cache((slug: string) =>
  getOrganizationBySlug(prisma, { slug })
);

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  try {
    const org = await loadOrg(slug);
    return {
      title: org.displayName,
      description: org.bio ?? `Events hosted by ${org.displayName}`,
    };
  } catch (err) {
    if (err instanceof NotFoundError) return {};
    throw err;
  }
}

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let org;
  try {
    org = await loadOrg(slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return <OrganizationProfile org={org} />;
}
