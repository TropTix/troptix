import { timingSafeEqual } from 'node:crypto';
import prisma from '@/server/prisma';
import { getServerUser } from '@/server/authUser';

/**
 * How a viewer reached an order page.
 * - `owner`  — an authenticated session matching the order (by userId or email).
 * - `guest`  — a valid `?t=` access token, but not signed in as the buyer.
 * - `denied` — neither; the page must not render order data.
 */
export type AccessMode = 'owner' | 'guest' | 'denied';

export interface OrderAccess {
  accessMode: AccessMode;
  /** True once the order exists — lets callers 404 vs. 403 if they care. */
  orderExists: boolean;
}

/** Length-independent constant-time string compare (avoids token timing leaks). */
function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Resolve how the current request may view an order. This is the single guard
 * shared by the order detail, tickets, and receipt pages — it replaces the old
 * "anyone with the URL" behavior. Reads the session once and the order's auth
 * fields once; the page fetches full order data separately after this passes.
 */
export async function resolveOrderAccess(
  orderId: string,
  token?: string | null
): Promise<OrderAccess> {
  const order = await prisma.orders.findUnique({
    where: { id: orderId },
    select: { email: true, userId: true, accessToken: true },
  });

  if (!order) {
    return { accessMode: 'denied', orderExists: false };
  }

  const user = await getServerUser();
  const isOwner =
    !!user &&
    ((!!order.userId && order.userId === user.uid) ||
      (!!order.email &&
        !!user.email &&
        order.email.toLowerCase() === user.email.toLowerCase()));

  if (isOwner) {
    return { accessMode: 'owner', orderExists: true };
  }

  const isGuest =
    !!token && !!order.accessToken && tokensMatch(token, order.accessToken);

  return {
    accessMode: isGuest ? 'guest' : 'denied',
    orderExists: true,
  };
}
