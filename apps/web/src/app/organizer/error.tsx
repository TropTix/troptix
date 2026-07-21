'use client'; // Error components must be Client Components

import { useEffect } from 'react';
import posthog from 'posthog-js';

import { ErrorDisplay } from '@/components/utils/error-display';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/** Segment-scoped error boundary for the organizer dashboard. */
export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    posthog.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <ErrorDisplay
      message="Something went wrong in the organizer section."
      onReset={reset}
    />
  );
}
