import { Prisma, ReservationStatus } from '@troptix/db';
import type { CodeRefusal } from '../../contracts/checkout';

export type GrantState =
  | 'active'
  | 'inUse'
  | 'exhausted'
  | 'expired'
  | 'revoked';

export interface GrantStateFields {
  maxUses: number | null;
  usedCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

type Db = Prisma.TransactionClient;

/**
 * Derived, never stored (ADR 0037). An exhausted grant with a HELD hold reads
 * `inUse` even past the hold's expiry: until the sweep releases it, that hold
 * can still be paid, and "try again in a few minutes" is the true answer.
 */
export function deriveGrantState(
  grant: GrantStateFields,
  hasHeldReservation: boolean,
  now: Date
): GrantState {
  if (grant.revokedAt) return 'revoked';
  if (grant.expiresAt && grant.expiresAt <= now) return 'expired';
  if (grant.maxUses === null || grant.usedCount < grant.maxUses) {
    return 'active';
  }
  return hasHeldReservation ? 'inUse' : 'exhausted';
}

export async function grantState(
  db: Db,
  grant: GrantStateFields & { id: string },
  now: Date
): Promise<GrantState> {
  const state = deriveGrantState(grant, true, now);
  if (state !== 'inUse') return state;
  const held = await db.reservation.count({
    where: { grantId: grant.id, status: ReservationStatus.HELD },
  });
  return deriveGrantState(grant, held > 0, now);
}

export function refusalFor(
  state: Exclude<GrantState, 'active'>,
  expiresAt: Date | null
): CodeRefusal {
  switch (state) {
    case 'inUse':
      return { type: 'inUse' };
    case 'expired':
      return { type: 'expired', expiresAt: expiresAt!.toISOString() };
    case 'exhausted':
    case 'revoked':
      return { type: 'unavailable' };
  }
}

/**
 * Takes one use under the grant's row lock, or says why not. Lock order is
 * grant before ticket types on every path, so a hold and a settle cannot
 * deadlock.
 */
export async function takeGrantUseInTx(
  tx: Db,
  grantId: string,
  now: Date
): Promise<CodeRefusal | null> {
  const [grant] = await tx.$queryRaw<
    Array<GrantStateFields & { id: string }>
  >(Prisma.sql`
    SELECT id, "maxUses", "usedCount", "expiresAt", "revokedAt"
    FROM "Grant"
    WHERE id = ${grantId}
    FOR UPDATE
  `);
  if (!grant) return { type: 'invalid' };

  const state = await grantState(tx, grant, now);
  if (state !== 'active') return refusalFor(state, grant.expiresAt);

  await tx.grant.update({
    where: { id: grantId },
    data: { usedCount: { increment: 1 } },
  });
  return null;
}

/**
 * Settle after an expired hold: takes the use back if one is free, ignoring
 * expiry and revocation, since the guest paid in time (plan decision 8).
 */
export async function retakeGrantUseInTx(
  tx: Db,
  grantId: string
): Promise<boolean> {
  const taken = await tx.$executeRaw(Prisma.sql`
    UPDATE "Grant"
    SET "usedCount" = "usedCount" + 1, "updatedAt" = now()
    WHERE id = ${grantId}
      AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
  `);
  return taken === 1;
}

export async function returnGrantUseInTx(
  tx: Db,
  grantId: string
): Promise<void> {
  await tx.grant.update({
    where: { id: grantId },
    data: { usedCount: { decrement: 1 } },
  });
}
