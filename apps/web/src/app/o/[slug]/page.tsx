import { cache } from 'react';
import { notFound } from 'next/navigation';
import prisma from '@/server/prisma';
import { getOrganizationBySlug, NotFoundError } from '@troptix/api/server';
import OrganizationProfile from './_components/OrganizationProfile';

// Public organization page (surface F5). See
// docs/plans/2026-06-event-spotlight-and-organizer-brand.md.

// Deduped per request so generateMetadata + the page share one DB read.
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
