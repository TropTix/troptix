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
 * Replaces the root layout when it (or the providers tree) throws, so it must
 * render its own <html>/<body> and cannot depend on any app provider.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
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
