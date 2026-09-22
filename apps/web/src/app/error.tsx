'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

import { ErrorDisplay } from '@/components/utils/error-display';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    posthog.captureException(error);
    console.error(error);
  }, [error]);

  return <ErrorDisplay onReset={reset} />;
}
