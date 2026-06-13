import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter, createContext } from '@troptix/api/server';
import prisma from '@/server/prisma';

/**
 * tRPC HTTP endpoint (App Router). Additive — exposes the @troptix/api router
 * at /api/trpc. Nothing calls it yet: the web client migrates onto it in the
 * Stage 3 checkout redesign, and the Expo app consumes it later. The actor is
 * anonymous until Supabase Auth lands (Stage 1c); the only wired procedures
 * (checkout reads) are public.
 */
function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext({ prisma }),
  });
}

export { handler as GET, handler as POST };
