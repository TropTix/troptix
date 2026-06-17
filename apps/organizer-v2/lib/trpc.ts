import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from '@troptix/api';
import { supabase } from './supabase';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Vanilla tRPC client (no react-query). Each call is a plain async function,
 * so hooks can wrap it with useState/useEffect as needed.
 *
 * Attaches the Supabase access token as a Bearer header so the web tRPC route
 * handler can resolve the actor and gate protectedProcedures.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: `${apiUrl}/api/trpc`,
      headers: async () => {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});
