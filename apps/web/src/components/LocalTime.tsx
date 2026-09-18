'use client';

import { useSyncExternalStore } from 'react';
import { format } from 'date-fns';

const subscribe = () => () => {};

/**
 * Operational timestamps render viewer-local (ADR 0021). The server pass
 * cannot know the viewer's zone (it would format in the server's — UTC on
 * Vercel), so nothing renders until the client mounts.
 */
export function LocalTime({
  at,
  dateFormat = 'MMM d, yyyy',
}: {
  at: string | Date;
  dateFormat?: string;
}) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );

  if (!mounted) return null;
  return <>{format(new Date(at), dateFormat)}</>;
}
