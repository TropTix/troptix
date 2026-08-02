'use client';

import { Toaster as SonnerToaster } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
export default function Toaster() {
  const isMobile = useIsMobile();
  const position = isMobile ? 'top-center' : 'bottom-right';

  return (
    <SonnerToaster
      position={position}
      toastOptions={{
        style: {
          borderRadius: 'var(--radius)',
        },

        // Toasts float over arbitrary content, so tints mix into the opaque
        // card color instead of using alpha.
        classNames: {
          success:
            'bg-[color-mix(in_srgb,var(--success)_12%,var(--card))]! text-success! border-success/25!',
          error:
            'bg-[color-mix(in_srgb,var(--destructive)_12%,var(--card))]! text-destructive! border-destructive/25!',
          warning:
            'bg-[color-mix(in_srgb,var(--warning)_12%,var(--card))]! text-warning! border-warning/25!',
          info: 'bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))]! text-primary! border-primary/25!',
          loading: 'bg-muted! text-muted-foreground!',
        },
      }}
    />
  );
}
