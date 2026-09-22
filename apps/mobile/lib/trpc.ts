import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from '@troptix/api';
import { supabase } from './supabase';

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

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
