'use client';

import type { CSSProperties } from 'react';
import { Toaster as SonnerToaster } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';

export default function Toaster() {
  const isMobile = useIsMobile();

  return (
    <SonnerToaster
      position={isMobile ? 'top-center' : 'bottom-right'}
      closeButton
      style={
        {
          '--normal-bg': 'hsl(var(--background))',
          '--normal-text': 'hsl(var(--foreground))',
          '--normal-border': 'hsl(var(--border))',
        } as CSSProperties
      }
      toastOptions={{
        style: {
          borderRadius: 'var(--radius)',
        },
        classNames: {
          description: '!text-muted-foreground',
          success: '[&_[data-icon]]:!text-success',
          error: '[&_[data-icon]]:!text-destructive',
          warning: '[&_[data-icon]]:!text-warning',
          info: '[&_[data-icon]]:!text-primary',
        },
      }}
    />
  );
}
