/**
 * Read-side checkout services: the public ticket list (`getCheckoutConfig`) and
 * discount/password-code unlock (`applyCode`). Ports of
 * `apps/web/src/app/api/checkout/{config,apply-code}/route.ts`, rewritten
 * against the reservation-rebuild columns and the cents contract.
 *
 * Prisma is injected as the first argument (framework-agnostic, unit-testable
 * with a fake). These are reads keyed off `eventId` / `code`, so — like the
 * reservation primitives — they carry no authorization (ADR 0013).
 *
 * Availability = `capacity - reserved - sold` (the new counters), so active
 * holds are already netted out via `reserved`; no separate pending-order query.
 * The new columns (`capacity`/`priceCents`) are nullable until the Stage 3
 * backfill, so each read falls back to its legacy source during the transition.
 * The sale window has no such fallback: `saleStartsAt`/`saleEndsAt` are the
 * one pair, and are full timestamps (ADR 0020).
 */
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

// Exactly the columns the mapper needs — shared by both queries so they read
// the same data. New reservation-rebuild columns first, legacy fallbacks next.
const TICKET_TYPE_SELECT = {
  id: true,
  name: true,
  description: true,
  maxPurchasePerUser: true,
  ticketingFees: true,
  ticketType: true,
  // New counters / cents (← backfilled).
  capacity: true,
  reserved: true,
  sold: true,
  priceCents: true,
  // Legacy fallbacks (read until backfill; dropped in M4–M12).
  quantity: true,
  price: true,
  // The sale window. One pair — ADR 0020.
  saleStartsAt: true,
  saleEndsAt: true,
  event: { select: { isDraft: true } },
} as const;

type TicketTypeRow = Prisma.TicketTypesGetPayload<{
  select: typeof TICKET_TYPE_SELECT;
}>;

/**
 * Map a ticket-type row to its public `CheckoutTicket` shape — the availability,
 * sale-window, and fee logic shared by `getCheckoutConfig` and `applyCode`.
 * `now` is injected so callers compute against one consistent instant.
 */
function toCheckoutTicket(
  tt: TicketTypeRow,
  now: Date,
  opts: { isPasswordProtected?: boolean } = {}
): CheckoutTicket {
  const priceCents = tt.priceCents ?? Math.round(tt.price * 100);
  const capacity = tt.capacity ?? tt.quantity;

  const availability = Math.max(0, capacity - tt.reserved - tt.sold);
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

/**
 * The public ticket list for an event's checkout: every non-code-gated ticket
 * type, available ones first then by ascending price. Throws `NotFoundError`
 * when the event itself doesn't exist (vs. an event with no public tickets,
 * which returns an empty list).
 */
export async function getCheckoutConfig(
  prisma: PrismaClient,
  input: CheckoutConfigInput
): Promise<CheckoutConfigResponse> {
  const ticketTypes = await prisma.ticketTypes.findMany({
    where: {
      eventId: input.eventId,
      // A null/empty discount code means the ticket is public.
      OR: [
        { discountCode: { equals: null } },
        { discountCode: { equals: '' } },
      ],
    },
    select: TICKET_TYPE_SELECT,
    // No DB orderBy — the in-memory sort below (available-first, then by
    // priceCents) is the source of truth and would re-order any DB sort anyway.
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
      // Available (maxAllowedToAdd > 0) first, then by price ascending.
      const aAvailable = a.maxAllowedToAdd > 0 ? 0 : 1;
      const bAvailable = b.maxAllowedToAdd > 0 ? 0 : 1;
      if (aAvailable !== bAvailable) return aAvailable - bAvailable;
      return a.priceCents - b.priceCents;
    });

  return { tickets };
}

/**
 * Unlock a code-gated ticket type. Returns a discriminated result — `password`
 * with the unlocked ticket on a (case-insensitive) match, `invalid` otherwise.
 * Not found is a normal `invalid` result, not a thrown error (the caller maps
 * it to a 401/normal response).
 */
export async function applyCode(
  prisma: PrismaClient,
  input: ApplyCodeInput
): Promise<ApplyCodeResponse> {
  const match = await prisma.ticketTypes.findFirst({
    where: {
      eventId: input.eventId,
      discountCode: { equals: input.code, mode: 'insensitive' },
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
