'use client';

import { User } from '@/hooks/types/User';
import { createClient } from '@/lib/supabase/client';
import { usePostHog } from 'posthog-js/react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

const emptyUser: User = { id: '' };

export const TropTixContext = createContext<{ user: User; loading: boolean }>({
  user: emptyUser,
  loading: true,
});

export const useAuth = () => useContext(TropTixContext);

// Mirrors the server's fast-path predicate (see server/authUser.ts): a
// `sb-<ref>-auth-token` cookie (possibly chunked) is what getClaims reads.
function hasSupabaseAuthCookie() {
  return document.cookie.split('; ').some((entry) => {
    const name = entry.split('=')[0];
    return name.startsWith('sb-') && name.includes('-auth-token');
  });
}

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
  const posthog = usePostHog();
  // Tracks whether we've identified this session, so sign-out resets exactly
  // once — reset() on an already-anonymous visitor would rotate their id.
  const identifiedId = useRef<string | null>(null);
  // Serializes loadUser: a response only applies if no newer load (or local
  // sign-out reset) superseded it while it was in flight.
  const loadSeq = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function loadUser() {
      const seq = ++loadSeq.current;
      try {
        const res = await fetch('/api/user/me', { cache: 'no-store' });
        const json = await res.json();
        if (active && seq === loadSeq.current) {
          const nextUser: User = json.user ?? emptyUser;
          setUser(nextUser);
          if (nextUser.id) {
            posthog.identify(
              nextUser.id,
              nextUser.email ? { email: nextUser.email } : undefined
            );
            identifiedId.current = nextUser.id;
          } else if (identifiedId.current) {
            posthog.reset();
            identifiedId.current = null;
          }
        }
      } catch (error) {
        console.error('Failed to load user:', error);
        if (active && seq === loadSeq.current) setUser(emptyUser);
      } finally {
        if (active && seq === loadSeq.current) setLoading(false);
      }
    }

    // onAuthStateChange fires INITIAL_SESSION right after subscribing, so this
    // loads on mount too — no separate up-front fetch needed. A cookie without
    // a parseable client session still asks the server: /api/user/me stays the
    // source of truth.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session || hasSupabaseAuthCookie()) {
        void loadUser();
        return;
      }
      if (active) {
        loadSeq.current++;
        if (identifiedId.current) {
          posthog.reset();
          identifiedId.current = null;
        }
        setUser(emptyUser);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [posthog]);

  return (
    <TropTixContext.Provider value={{ user, loading }}>
      <div className="mx-auto min-h-screen font-sans tracking-tight antialiased">
        <div className="flex flex-col overflow-hidden supports-[overflow:clip]:overflow-clip">
          {children}
        </div>
      </div>
    </TropTixContext.Provider>
  );
}
