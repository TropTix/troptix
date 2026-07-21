'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';

import { ErrorDisplay } from '@/components/utils/error-display';
import '../styles/globals.css';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global error boundary. This is the only boundary that catches errors thrown
 * by the root layout / providers tree, and it *replaces* the root layout — so
 * it must render its own <html>/<body> and cannot depend on any app provider
 * (PostHog, Ant, header/footer) since those may be what failed.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // PostHog may not have initialized if the providers tree is what failed.
    try {
      posthog.captureException(error);
    } catch {
      // swallow — reporting must never mask the original error
    }
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorDisplay onReset={reset} />
      </body>
    </html>
  );
}
