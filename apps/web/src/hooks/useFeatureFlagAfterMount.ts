'use client';

import { useSyncExternalStore } from 'react';
import { useFeatureFlagEnabled } from 'posthog-js/react';

const subscribeNothing = () => () => {};

/** Undefined until mount, so the first client render matches the server HTML. */
export function useFeatureFlagAfterMount(flag: string): boolean | undefined {
  const enabled = useFeatureFlagEnabled(flag);
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );
  return mounted ? enabled : undefined;
}
