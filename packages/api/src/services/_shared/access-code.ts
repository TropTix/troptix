import type { Prisma } from '@troptix/db';
import { generateId } from './ids';

export function normalizeAccessCode(
  raw: string | null | undefined
): string | null {
  const code = raw?.trim().toUpperCase() ?? '';
  return code === '' ? null : code;
}

/**
 * The ticket type form's single code field, read and written through grants
 * until the Access codes page replaces it (guest access plan, decision 19).
 */
export const legacyAccessCodeSelect = {
  where: { grant: { revokedAt: null } },
  select: { grant: { select: { code: true } } },
  orderBy: { grant: { createdAt: 'asc' } },
  take: 1,
} satisfies Prisma.TicketTypes$grantsArgs;

export function legacyAccessCodeOf(ticketType: {
  grants: { grant: { code: string } }[];
}): string | null {
  return ticketType.grants[0]?.grant.code ?? null;
}

/**
 * Mirrors the old column: the type sits on exactly the unlimited grant for
 * its code, or on none and public. Moves join rows, which a grant otherwise
 * never allows, so it must not outlive the form field.
 */
export async function writeLegacyAccessCode(
  tx: Prisma.TransactionClient,
  eventId: string,
  ticketTypeId: string,
  raw: string | null | undefined
): Promise<void> {
  const code = normalizeAccessCode(raw);
  await tx.grantTicketType.deleteMany({
    where: {
      ticketTypeId,
      ...(code === null ? {} : { grant: { code: { not: code } } }),
    },
  });
  await tx.ticketTypes.update({
    where: { id: ticketTypeId },
    data: { hidden: code !== null },
  });
  if (code === null) return;

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
