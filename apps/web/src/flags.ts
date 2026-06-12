import { flag } from 'flags/next';
import { readClaimsFromCookies } from '@/lib/supabase/server';

export const exampleFlag = flag({
  key: 'first-flag',
  defaultValue: true,
  decide() {
    return true;
  },
});

interface Entities {
  user_id?: string;
  email?: string;
}

/** Minimal cookie reader shape provided to flag `identify`. */
type CookieReader = {
  get(name: string): { value: string } | undefined;
  getAll(): { name: string; value: string }[];
};

/** Resolve the targeting identity from the Supabase session (email + auth id). */
async function identifyUser(cookies: CookieReader): Promise<Entities> {
  try {
    const claims = await readClaimsFromCookies(cookies);
    if (claims?.sub) {
      return { user_id: claims.sub, email: claims.email };
    }
  } catch {
    // unauthenticated / unreachable
  }
  return {};
}

export const openEventCreation = flag({
  key: 'open-event-creation',
  defaultValue: false,
  identify({ cookies }) {
    return identifyUser(cookies as CookieReader);
  },
  decide({ entities }) {
    if (!entities) {
      return false;
    }
    const { email, user_id } = entities;
    if (!email || !user_id) {
      return false;
    }
    if (email.endsWith('@usetroptix.com')) {
      return true;
    }
    return false;
  },
});
