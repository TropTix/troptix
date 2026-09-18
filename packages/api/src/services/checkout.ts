import type { PrismaClient, Prisma } from '@troptix/db';
import {
  type ApplyCodeInput,
  type ApplyCodeResponse,
  type CheckoutConfigInput,
  type CheckoutConfigResponse,
  type CheckoutTicket,
} from '../contracts/checkout';
import { calculateFeesCents } from './_shared/fees';
import { NotFoundError } from './_shared/errors';

const TICKET_TYPE_SELECT = {
  id: true,
  name: true,
  description: true,
  maxPurchasePerUser: true,
  ticketingFees: true,
  ticketType: true,
  capacity: true,
  reserved: true,
  sold: true,
  priceCents: true,
  price: true,
  saleStartsAt: true,
  saleEndsAt: true,
  event: { select: { isDraft: true } },
} as const;

type TicketTypeRow = Prisma.TicketTypesGetPayload<{
  select: typeof TICKET_TYPE_SELECT;
}>;

function toCheckoutTicket(
  tt: TicketTypeRow,
  now: Date,
  opts: { isPasswordProtected?: boolean } = {}
): CheckoutTicket {
  const priceCents = tt.priceCents ?? Math.round(tt.price * 100);
  // Active holds are already netted out via `reserved` — never subtract a
  // separate pending-order/hold count on top.
  const availability = Math.max(0, tt.capacity - tt.reserved - tt.sold);
  const saleIsActive = now >= tt.saleStartsAt && now <= tt.saleEndsAt;
  const maxAllowedToAdd =
    saleIsActive && !tt.event.isDraft
      ? Math.max(0, Math.min(availability, tt.maxPurchasePerUser))
      : 0;
  const feesCents =
    tt.ticketingFees === 'PASS_TICKET_FEES'
      ? calculateFeesCents(priceCents)
      : 0;

  return {
    id: tt.id,
    name: tt.name,
    description: tt.description,
    priceCents,
    saleStartsAt: tt.saleStartsAt.toISOString(),
    saleEndsAt: tt.saleEndsAt.toISOString(),
    maxAllowedToAdd,
    feesCents,
    feeStructure: tt.ticketingFees,
    ticketType: tt.ticketType,
    ticketQuantityLow: availability > 0 && availability < 10,
    ...(opts.isPasswordProtected ? { isPasswordProtected: true } : {}),
  };
}

export async function getCheckoutConfig(
  prisma: PrismaClient,
  input: CheckoutConfigInput
): Promise<CheckoutConfigResponse> {
  const ticketTypes = await prisma.ticketTypes.findMany({
    where: {
      eventId: input.eventId,
      OR: [
        { discountCode: { equals: null } },
        { discountCode: { equals: '' } },
      ],
    },
    select: TICKET_TYPE_SELECT,
  });

  if (ticketTypes.length === 0) {
    const eventExists = await prisma.events.count({
      where: { id: input.eventId },
    });
    if (eventExists === 0) {
      throw new NotFoundError(`Event with ID ${input.eventId} not found.`);
    }
    return { tickets: [] };
  }

  const now = new Date();
  const tickets = ticketTypes
    .map((tt) => toCheckoutTicket(tt, now))
    .sort((a, b) => {
      const aAvailable = a.maxAllowedToAdd > 0 ? 0 : 1;
      const bAvailable = b.maxAllowedToAdd > 0 ? 0 : 1;
      if (aAvailable !== bAvailable) return aAvailable - bAvailable;
      return a.priceCents - b.priceCents;
    });

  return { tickets };
}

export async function applyCode(
  prisma: PrismaClient,
  input: ApplyCodeInput
): Promise<ApplyCodeResponse> {
  // mode:'insensitive' compiles to ILIKE, which Prisma does not escape — a
  // submitted `%` would otherwise match every gated code on the event.
  const code = input.code.replace(/[\\%_]/g, '\\$&');

  const match = await prisma.ticketTypes.findFirst({
    where: {
      eventId: input.eventId,
      discountCode: { equals: code, mode: 'insensitive' },
    },
    select: TICKET_TYPE_SELECT,
  });

  if (!match) {
    return { type: 'invalid', isValid: false, message: 'Invalid code.' };
  }

  const unlockedTicket = toCheckoutTicket(match, new Date(), {
    isPasswordProtected: true,
  });

  return {
    type: 'password',
    isValid: true,
    message: `Code applied successfully. "${unlockedTicket.name}" is now available.`,
    unlockedTicket,
  };
}
