import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext } from '@troptix/api/server';
import type { Actor } from '@troptix/api/server';
import { getUserFromIdTokenCookie } from '@/server/authUser';
import prisma from '@/server/prisma';
import { stripe } from '@/server/lib/stripe';
import { serverAnalytics } from '@/server/lib/analytics';
import { getAppBaseUrl } from '@/lib/appUrl';

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
      createContext({
        prisma,
        actor,
        stripe,
        siteUrl: getAppBaseUrl(),
        analytics: serverAnalytics(),
      }),
  });
}

export { handler as GET, handler as POST };
