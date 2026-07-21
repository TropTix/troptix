import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@troptix/api';

// Typed tRPC React Query client. The provider is wired in app/providers.tsx
// (reuses the app's QueryClient); the server route lives at /api/trpc.
export const trpc = createTRPCReact<AppRouter>();
