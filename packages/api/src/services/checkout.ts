import type { PrismaClient } from '@troptix/db';
import type { ApplyCodeInput, ApplyCodeResponse } from '../contracts/checkout';
import { normalizeAccessCode } from './_shared/access-code';
import { sortEventTickets, toEventTicket } from './_shared/eventTicket';

export async function applyCode(
  prisma: PrismaClient,
  input: ApplyCodeInput
): Promise<ApplyCodeResponse> {
  const accessCode = normalizeAccessCode(input.code);
  if (accessCode === null) return { type: 'invalid' };

  const rows = await prisma.ticketTypes.findMany({
    where: { eventId: input.eventId, accessCode },
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
  });

  if (rows.length === 0) return { type: 'invalid' };

  const now = new Date();
  return {
    type: 'unlocked',
    tickets: sortEventTickets(
      rows.map((tt) => toEventTicket(tt, tt.event.isDraft, now))
    ),
  };
}
