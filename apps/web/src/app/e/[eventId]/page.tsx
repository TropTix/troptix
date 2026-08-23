import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { connection } from 'next/server';
import prisma from '@/server/prisma';
import {
  getEventDetailRaw,
  shapeEventDetail,
  NotFoundError,
} from '@troptix/api/server';
import { notFound } from 'next/navigation';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { eventFlyerUrl } from '@/lib/supabase/storage';
import { eventDetailCacheTag } from '@/server/revalidateEventPages';
import EventDetailView from './_components/EventDetailView';

// The public event page. Legacy `/events/[eventId]` 308-redirects here
// (next.config.js). See docs/plans/2026-06-event-page-redesign.md.

// Cached 60s + tag-busted on organizer edits. Availability can be 60s stale —
// display-only; createReservation re-checks under the inventory lock.
const loadEventRaw = cache((eventId: string) =>
  unstable_cache(
    () => getEventDetailRaw(prisma, { eventId }),
    ['event-detail', eventId],
    { revalidate: 60, tags: [eventDetailCacheTag(eventId)] }
  )()
);

export async function generateMetadata(props: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await props.params;
  try {
    const event = await loadEventRaw(eventId);
    // OG images must be absolute URLs; resolve the stored path (ADR 0016).
    const ogImage = eventFlyerUrl(event.imageUrl);
    return {
      title: event.name,
      description: event.description,
      robots: event.isPrivate ? { index: false, follow: false } : undefined,
      openGraph: {
        title: event.name,
        description: event.description,
        images: ogImage ? [ogImage] : [],
      },
    };
  } catch (err) {
    if (err instanceof NotFoundError) return {};
    throw err;
  }
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  // Without this a published event's render could be cached as static forever —
  // nothing else on the non-draft path is request-bound.
  await connection();
  const { eventId } = await params;

  let event;
  try {
    event = shapeEventDetail(await loadEventRaw(eventId), new Date());
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  if (event.isDraft) {
    const user = await getUserFromIdTokenCookie();
    if (user?.uid !== event.organizerUserId) {
      notFound();
    }
  }

  return (
    <EventDetailView
      event={event}
      eventEnded={Date.now() > Date.parse(event.endsAt)}
    />
  );
}
