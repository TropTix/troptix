import prisma from '@/server/prisma';
import { getEventDetail, NotFoundError } from '@troptix/api/server';
import { notFound } from 'next/navigation';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import { eventFlyerUrl } from '@/lib/supabase/storage';
import EventPageClean from './_components/EventPageClean';

// New event page (Clean direction) on a parallel `/e/[eventId]` route while
// legacy `/events/[eventId]` stays live. See
// docs/plans/2026-06-event-page-redesign.md.
//
// Data comes from the `@troptix/api` service layer (called directly — this is a
// server component, so no tRPC round-trip). The service returns a client-safe
// DTO with a server-computed "From $X"; no ticket rows or discount codes reach
// the browser.

export async function generateMetadata(props: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await props.params;
  try {
    const event = await getEventDetail(prisma, { eventId });
    // OG images must be absolute URLs; resolve the stored path (ADR 0016).
    const ogImage = eventFlyerUrl(event.imageUrl);
    return {
      title: event.name,
      description: event.description,
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
  const user = await getUserFromIdTokenCookie();
  const { eventId } = await params;

  let event;
  try {
    event = await getEventDetail(prisma, { eventId });
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  if (event.isDraft && user?.uid !== event.organizerUserId) {
    notFound();
  }

  return <EventPageClean event={event} />;
}
