'use client';

import { User } from '@/hooks/types/User';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Inter } from 'next/font/google';
import { createContext, useContext, useEffect, useState } from 'react';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const emptyUser: User = { id: '' };

export const TropTixContext = createContext<{ user: User; loading: boolean }>({
  user: emptyUser,
  loading: true,
});

export const useAuth = () => useContext(TropTixContext);

/**
 * Client-side auth state for Client Components (header, checkout). The single
 * source of truth is /api/user/me — the server resolves the Supabase session
 * (getClaims) → the app `Users` row (stable id + role). We re-fetch it whenever
 * the Supabase auth state changes (sign-in / sign-out / token refresh).
 *
 * Protected routes are gated server-side (proxy + getServerUser), so this never
 * blocks rendering — it just hydrates UI that reacts to the signed-in user.
 */
export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User>(emptyUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function loadUser() {
      try {
        const res = await fetch('/api/user/me', { cache: 'no-store' });
        const json = await res.json();
        if (active) setUser(json.user ?? emptyUser);
      } catch (error) {
        console.error('Failed to load user:', error);
        if (active) setUser(emptyUser);
      } finally {
        if (active) setLoading(false);
      }
    }

    // onAuthStateChange fires INITIAL_SESSION right after subscribing, so this
    // loads on mount too — no separate up-front fetch needed (avoids a double
    // /api/user/me on every page load).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => loadUser());

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <TropTixContext.Provider value={{ user, loading }}>
      <div
        className={cn(
          'min-h-screen font-sans antialiased mx-auto',
          inter.variable
        )}
      >
        <div
          className={`${inter.variable} font-inter antialiased text-gray-900 tracking-tight`}
        >
          <div className="flex flex-col overflow-hidden supports-[overflow:clip]:overflow-clip">
            {children}
          </div>
        </div>
      </div>
    </TropTixContext.Provider>
  );
}
