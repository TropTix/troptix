'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

import { ErrorDisplay } from '@/components/utils/error-display';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root error boundary for the App Router. Catches render errors thrown by any
 * page below the root layout and renders inside it, so the header and footer
 * stay in place. Errors in the root layout / providers themselves fall through
 * to `app/global-error.tsx`.
 */
export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    posthog.captureException(error);
    console.error(error);
  }, [error]);

  return <ErrorDisplay onReset={reset} />;
}
