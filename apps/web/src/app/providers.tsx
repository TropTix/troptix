'use client';

import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from '@/lib/trpc';
import { usePathname } from 'next/navigation';
import { ConfigProvider } from 'antd';
import { MotionConfig } from 'motion/react';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';

import AuthProvider from '@/components/AuthProvider';
import UnifiedHeader from '@/components/ui/unified-header';

const queryClient = new QueryClient();

function GlobalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOrganizer = pathname?.startsWith('/organizer');
  // Standard pages (and the event page) sit below the fixed header; organizer
  // pages manage their own top spacing.
  const offsetContent = !isOrganizer;

  return (
    <div>
      <UnifiedHeader />
      <div className={`flex-grow border-x ${offsetContent ? 'mt-16' : ''}`}>
        {children}
      </div>
    </div>
  );
}

// The reservationId is a bearer capability (it dereferences to the order and
// ticket QRs). It stays in the URL by design (resume-on-refresh), so strip it
// from URL properties before they reach PostHog.
function stripReservationParam(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    const url = new URL(value);
    if (!url.searchParams.has('reservation')) return value;
    url.searchParams.delete('reservation');
    return url.toString();
  } catch {
    return value;
  }
}

function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      capture_pageview: 'history_change',
      capture_pageleave: true,
      capture_exceptions: true,
      debug: process.env.NODE_ENV === 'development',
      sanitize_properties: (properties) => {
        for (const key of [
          '$current_url',
          '$referrer',
          '$initial_current_url',
        ]) {
          if (properties[key]) {
            properties[key] = stripReservationParam(properties[key]);
          }
        }
        return properties;
      },
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [trpcClient] = useState(() =>
    trpc.createClient({ links: [httpBatchLink({ url: '/api/trpc' })] })
  );

  return (
    <ConfigProvider
      theme={{
        components: {
          /* Ant Design component tokens */
        },
      }}
    >
      <PostHogProvider>
        <QueryClientProvider client={queryClient}>
          <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <AuthProvider>
              {/* Honor the OS "Reduce Motion" setting app-wide: disables
                  transform/layout animations while keeping opacity fades. */}
              <MotionConfig reducedMotion="user">
                <GlobalLayout>{children}</GlobalLayout>
              </MotionConfig>
            </AuthProvider>
          </trpc.Provider>
        </QueryClientProvider>
      </PostHogProvider>
    </ConfigProvider>
  );
}
