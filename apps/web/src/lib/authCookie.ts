// Mirrors the server's fast-path predicate (see server/authUser.ts): a
// `sb-<ref>-auth-token` cookie (possibly chunked) is what getClaims reads.
export function hasSupabaseAuthCookie() {
  return document.cookie.split('; ').some((entry) => {
    const name = entry.split('=')[0];
    return name.startsWith('sb-') && name.includes('-auth-token');
  });
}

// Runs before first paint so the header can hide "Sign In" for a visitor who
// is probably signed in, without waiting for hydration.
export const authHintScript = `if((${hasSupabaseAuthCookie})())document.documentElement.dataset.auth=''`;
