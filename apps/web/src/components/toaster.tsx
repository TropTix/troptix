'use client';

import type { CSSProperties } from 'react';
import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';
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
      icons={{
        success: <CircleCheck className="h-4 w-4 text-success" />,
        error: <CircleX className="h-4 w-4 text-destructive" />,
        warning: <TriangleAlert className="h-4 w-4 text-warning" />,
        info: <Info className="h-4 w-4 text-primary" />,
      }}
      toastOptions={{
        style: {
          borderRadius: 'var(--radius)',
        },
        classNames: {
          description: '!text-muted-foreground',
        },
      }}
    />
  );
}
