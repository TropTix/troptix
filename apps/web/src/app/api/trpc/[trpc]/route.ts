import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext } from '@troptix/api/server';
import type { Actor } from '@troptix/api/server';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import prisma from '@/server/prisma';
import { stripe } from '@/server/lib/stripe';
import { getAppBaseUrl } from '@/lib/appUrl';

/**
 * Resolve the request actor from the Authorization header (Bearer token from
 * mobile/API clients) or from the session cookie (web clients). Returns
 * anonymous when no valid session is found.
 *
 * Uses getUserFromIdTokenCookie — the same auth path the REST organizer routes
 * use — so the token verification is consistent and already proven to work.
 */
async function resolveActor(req: Request): Promise<Actor> {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;

    const user = await getUserFromIdTokenCookie(token);
    if (!user) return { kind: 'anonymous' };

    return {
      kind: 'user',
      userId: user.uid,
      role: user.role ?? 'PATRON',
    };
  } catch {
    return { kind: 'anonymous' };
  }
}

async function handler(req: Request) {
  const actor = await resolveActor(req);
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () =>
      createContext({ prisma, actor, stripe, siteUrl: getAppBaseUrl() }),
  });
}

export { handler as GET, handler as POST };
