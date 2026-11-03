import { randomInt } from 'node:crypto';
import type { Prisma } from '@troptix/db';
import { generateId } from './ids';

export function normalizeAccessCode(
  raw: string | null | undefined
): string | null {
  const code = raw?.trim().toUpperCase() ?? '';
  return code === '' ? null : code;
}

// No 0/O or 1/I, so a code read aloud or off a screen survives.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateAccessCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Enough of each grant on a ticket type to answer the ticket type list's two
 * questions: which code the form edits, and whether any code still works.
 */
export const ticketTypeGrantsSelect = {
  select: {
    grant: {
      select: {
        code: true,
        createdAt: true,
        maxUses: true,
        usedCount: true,
        quantity: true,
        expiresAt: true,
        revokedAt: true,
        holderEmail: true,
      },
    },
  },
} satisfies Prisma.TicketTypes$grantsArgs;

type TicketTypeGrant = {
  grant: {
    code: string;
    createdAt: Date;
    maxUses: number | null;
    usedCount: number;
    quantity: number | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    holderEmail: string | null;
  };
};

/**
 * The ticket type form's single code field (guest access plan, decision 19):
 * the oldest grant shaped like the old column — unlimited, no cap, no expiry,
 * no holder, not revoked. An invitation is never the type's code.
 */
export function legacyAccessCodeOf(grants: TicketTypeGrant[]): string | null {
  const legacy = grants
    .map(({ grant }) => grant)
    .filter(
      (g) =>
        g.revokedAt === null &&
        g.maxUses === null &&
        g.quantity === null &&
        g.expiresAt === null &&
        g.holderEmail === null
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return legacy[0]?.code ?? null;
}

/**
 * Mirrors the old column: the type sits on exactly one unlimited grant for
 * its code, or on none and public. Moves join rows, which a grant otherwise
 * never allows, so it touches only legacy-shaped grants and must not outlive
 * the form field.
 */
export async function writeLegacyAccessCode(
  tx: Prisma.TransactionClient,
  eventId: string,
  ticketTypeId: string,
  raw: string | null | undefined
): Promise<void> {
  const code = normalizeAccessCode(raw);
  const unlinked = await tx.grantTicketType.deleteMany({
    where: {
      ticketTypeId,
      grant: {
        maxUses: null,
        quantity: null,
        expiresAt: null,
        holderEmail: null,
        revokedAt: null,
        ...(code === null ? {} : { code: { not: code } }),
      },
    },
  });
  if (code === null) {
    // A type hidden with the toggle and sold only by invitation has no legacy
    // code to clear; an empty field must not put it on public sale.
    if (unlinked.count > 0) {
      await tx.ticketTypes.update({
        where: { id: ticketTypeId },
        data: { hidden: false },
      });
    }
    return;
  }
  await tx.ticketTypes.update({
    where: { id: ticketTypeId },
    data: { hidden: true },
  });

  const grant = await tx.grant.upsert({
    where: { eventId_code: { eventId, code } },
    create: { id: generateId(), eventId, code },
    update: {},
    select: { id: true },
  });
  await tx.grantTicketType.createMany({
    data: [{ grantId: grant.id, ticketTypeId }],
    skipDuplicates: true,
  });
}
