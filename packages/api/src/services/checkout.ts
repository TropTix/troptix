import type { PrismaClient } from '@troptix/db';
import type { ApplyCodeInput, ApplyCodeResponse } from '../contracts/checkout';
import { normalizeAccessCode } from './_shared/access-code';
import { sortEventTickets, toEventTicket } from './_shared/eventTicket';
import { grantState, refusalFor } from './_shared/grants';

/** Never counts a use; the hold does (ADR 0037). */
export async function applyCode(
  prisma: PrismaClient,
  input: ApplyCodeInput
): Promise<ApplyCodeResponse> {
  const code = normalizeAccessCode(input.code);
  if (code === null) return { type: 'invalid' };

  const grant = await prisma.grant.findUnique({
    where: { eventId_code: { eventId: input.eventId, code } },
    select: {
      id: true,
      maxUses: true,
      usedCount: true,
      quantity: true,
      expiresAt: true,
      revokedAt: true,
      holderEmail: true,
      ticketTypes: {
        select: {
          ticketType: {
            select: {
              id: true,
              name: true,
              description: true,
              priceCents: true,
              price: true,
              ticketingFees: true,
              capacity: true,
              reserved: true,
              sold: true,
              maxPurchasePerUser: true,
              saleStartsAt: true,
              saleEndsAt: true,
              event: { select: { isDraft: true } },
            },
          },
        },
      },
    },
  });

  if (!grant || grant.ticketTypes.length === 0) return { type: 'invalid' };

  const now = new Date();
  const state = await grantState(prisma, grant, now);
  if (state !== 'active') return refusalFor(state, grant.expiresAt);

  return {
    type: 'unlocked',
    tickets: sortEventTickets(
      grant.ticketTypes.map(({ ticketType }) =>
        toEventTicket(ticketType, ticketType.event.isDraft, now, grant.quantity)
      )
    ),
    quantity: grant.quantity,
    holderEmail: grant.holderEmail,
    kind: grant.holderEmail
      ? 'invitation'
      : grant.maxUses !== null ||
          grant.expiresAt !== null ||
          grant.quantity !== null
        ? 'limited'
        : 'unlimited',
  };
}
