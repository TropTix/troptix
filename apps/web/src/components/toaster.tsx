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
          borderRadius: 'border-radius-lg',
        },

        classNames: {
          success: 'bg-green-100! text-green-700!',
          error: 'bg-red-100! text-red-700!',
          warning: 'bg-yellow-100! text-yellow-700!',
          info: 'bg-blue-100! text-blue-700!',
          loading: 'bg-sky-100! text-sky-700!',
        },
      }}
    />
  );
}
