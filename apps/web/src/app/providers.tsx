'use client';

import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { usePathname, useRouter } from 'next/navigation';
import { ConfigProvider } from 'antd';
import { MotionConfig } from 'motion/react';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';

import AuthProvider from '@/components/AuthProvider';
import { ErrorFallback } from '@/components/utils/ErrorFallback';
import UnifiedHeader from '@/components/ui/unified-header';
import Footer from '@/components/ui/footer';

const queryClient = new QueryClient();

function GlobalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOrganizer = pathname?.startsWith('/organizer');

  return (
    <div>
      <UnifiedHeader />
      <div className={`flex-grow border-x ${!isOrganizer ? 'mt-16' : ''}`}>
        {children}
      </div>
      {isOrganizer ? null : <Footer />}
    </div>
  );
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
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <ConfigProvider
      theme={{
        components: {
          /* Ant Design component tokens */
        },
      }}
    >
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onReset={() => {
          router.push('/');
        }}
      >
        <PostHogProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              {/* Honor the OS "Reduce Motion" setting app-wide: disables
                  transform/layout animations while keeping opacity fades. */}
              <MotionConfig reducedMotion="user">
                <GlobalLayout>{children}</GlobalLayout>
              </MotionConfig>
            </AuthProvider>
          </QueryClientProvider>
        </PostHogProvider>
      </ErrorBoundary>
    </ConfigProvider>
  );
}
