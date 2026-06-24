/**
 * `initiateCheckout` — the write-side checkout orchestration (Stage 3 plan).
 *
 * `reserve()` is deliberately a pure inventory hold; every business rule lives
 * here, in order: ticket types must exist on the event and (when code-gated)
 * be unlocked by the supplied code; the event must not be a draft; the sale
 * window must be open; quantities are pre-clamped to `maxPurchasePerUser`.
 * Then one atomic `reserve()` clamps to real availability, and:
 *
 *   free total  → synchronous `confirm({ reservationId })` (order materializes
 *                 immediately; the email goes through the outbox as usual)
 *   paid total  → `gateway.createPaymentIntent` (idempotency key = reservation
 *                 id) and the PI id is attached to the reservation, which is
 *                 what the webhook later confirms by
 *
 * If the gateway fails, the hold is released before rethrowing — inventory is
 * never stranded behind a payment error. If attaching the PI id fails, the PI
 * is orphaned (harmless: never confirmed, expires server-side) and the hold
 * expires via TTL.
 *
 * The signed-in user id is NOT part of the wire input — the tRPC adapter
 * passes it from the actor (ADR 0013), so a client can't claim another user.
 */
import type { PrismaClient } from '@troptix/db';
import {
  type InitiateCheckoutInput,
  type ValidatedItem,
  type ValidationResponse,
} from '../contracts/checkout';
import { TICKET_TYPE_SELECT } from './checkout';
import { calculateFeesCents } from './_shared/fees';
import { confirm, release, reserve } from './reservations';
import type { PaymentGateway } from './payments';

export interface InitiateCheckoutOptions {
  /** Stable app user id (`Users.id`) from the actor; null/absent for guests. */
  userId?: string | null;
  /** Injected clock for tests. */
  now?: Date;
  ttlMinutes?: number;
}

/** A requested item joined to its ticket-type row and pre-clamped quantity. */
interface PreparedItem {
  ticketTypeId: string;
  name: string;
  requested: number;
  /** Quantity to ask `reserve` for after business-rule clamping (0 ⇒ skip). */
  preGranted: number;
  unitPriceCents: number;
  feesCents: number;
  /** Set when a rule already decided this item's message (window/gating). */
  fixedMessage?: ValidatedItem['message'];
  isCodeGated: boolean;
}

export async function initiateCheckout(
  prisma: PrismaClient,
  gateway: PaymentGateway,
  input: InitiateCheckoutInput,
  opts: InitiateCheckoutOptions = {}
): Promise<ValidationResponse> {
  const now = opts.now ?? new Date();

  // Merge duplicate ticket types so each row is reserved exactly once.
  const requestedByType = new Map<string, number>();
  for (const item of input.items) {
    requestedByType.set(
      item.ticketTypeId,
      (requestedByType.get(item.ticketTypeId) ?? 0) + item.quantity
    );
  }

  const rows = await prisma.ticketTypes.findMany({
    where: {
      eventId: input.eventId,
      id: { in: Array.from(requestedByType.keys()) },
    },
    select: { ...TICKET_TYPE_SELECT, discountCode: true },
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));

  const prepared: PreparedItem[] = Array.from(requestedByType.entries()).map(
    ([ticketTypeId, requested]) => {
      const row = rowById.get(ticketTypeId);

      // Unknown ticket type — or code-gated without the right code. The two
      // are indistinguishable on purpose (don't leak gated tickets' existence).
      const isCodeGated = Boolean(row?.discountCode);
      const codeUnlocks =
        isCodeGated &&
        input.code != null &&
        row!.discountCode!.toLowerCase() === input.code.toLowerCase();
      if (!row || (isCodeGated && !codeUnlocks) || row.event.isDraft) {
        return {
          ticketTypeId,
          name: row?.name ?? 'Unknown ticket',
          requested,
          preGranted: 0,
          unitPriceCents: 0,
          feesCents: 0,
          fixedMessage: 'Ticket Type Not Found',
          isCodeGated,
        };
      }

      const unitPriceCents = row.priceCents ?? Math.round(row.price * 100);
      const feesCents =
        row.ticketingFees === 'PASS_TICKET_FEES'
          ? calculateFeesCents(unitPriceCents)
          : 0;
      const saleStartsAt = row.saleStartsAt ?? row.saleStartDate;
      const saleEndsAt = row.saleEndsAt ?? row.saleEndDate;

      if (now < saleStartsAt) {
        return {
          ticketTypeId,
          name: row.name,
          requested,
          preGranted: 0,
          unitPriceCents,
          feesCents,
          fixedMessage: 'Sale Not Started',
          isCodeGated,
        };
      }
      if (now > saleEndsAt) {
        return {
          ticketTypeId,
          name: row.name,
          requested,
          preGranted: 0,
          unitPriceCents,
          feesCents,
          fixedMessage: 'Sale Ended',
          isCodeGated,
        };
      }

      return {
        ticketTypeId,
        name: row.name,
        requested,
        preGranted: Math.min(requested, row.maxPurchasePerUser),
        unitPriceCents,
        feesCents,
        isCodeGated,
      };
    }
  );

  const reservable = prepared.filter((p) => p.preGranted > 0);

  // Everything failed business rules — no hold to take, nothing to release.
  if (reservable.length === 0) {
    return failureResponse(prepared);
  }

  const reserved = await reserve(prisma, {
    eventId: input.eventId,
    items: reservable.map((p) => ({
      ticketTypeId: p.ticketTypeId,
      quantity: p.preGranted,
      unitPriceCents: p.unitPriceCents,
      feesCents: p.feesCents,
    })),
    contact: input.contact,
    userId: opts.userId ?? null,
    ttlMinutes: opts.ttlMinutes,
  });
  const grantedByType = new Map(
    reserved.items.map((g) => [g.ticketTypeId, g.granted])
  );

  const validatedItems: ValidatedItem[] = prepared.map((p) => {
    const granted = p.fixedMessage
      ? 0
      : (grantedByType.get(p.ticketTypeId) ?? 0);
    const message: ValidatedItem['message'] =
      p.fixedMessage ??
      (granted === 0
        ? 'Sold Out'
        : granted < p.requested
          ? 'Quantity Reduced: Max Available'
          : 'Available');
    return {
      ticketTypeId: p.ticketTypeId,
      name: p.name,
      requestedQuantity: p.requested,
      validatedQuantity: granted,
      pricePerTicketCents: p.unitPriceCents,
      feesPerTicketCents: p.feesCents,
      message,
    };
  });

  // Inventory had nothing to give — tidy up the empty hold and report.
  if (!reserved.granted) {
    await release(prisma, reserved.reservationId);
    return failureResponse(prepared, validatedItems);
  }

  const wasAdjusted = validatedItems.some(
    (v) => v.validatedQuantity < v.requestedQuantity
  );
  const promotionApplied =
    input.code != null &&
    prepared.some(
      (p) =>
        p.isCodeGated &&
        !p.fixedMessage &&
        (grantedByType.get(p.ticketTypeId) ?? 0) > 0
    )
      ? input.code
      : null;

  const base = {
    isValid: true,
    wasAdjusted,
    validatedItems,
    subtotalCents: reserved.subtotalCents,
    feesCents: reserved.feesCents,
    totalCents: reserved.totalCents,
    promotionApplied,
    message: wasAdjusted
      ? ('Some tickets were unavailable or sold out and cart was adjusted' as const)
      : ('Tickets are available' as const),
    reservationId: reserved.reservationId,
    expiresAt: reserved.expiresAt.toISOString(),
  };

  // Free order: materialize synchronously — no PaymentIntent, no webhook.
  if (reserved.totalCents === 0) {
    await confirm(prisma, { reservationId: reserved.reservationId });
    return { ...base, isFree: true, clientSecret: null };
  }

  let paymentIntent;
  try {
    paymentIntent = await gateway.createPaymentIntent({
      amountCents: reserved.totalCents,
      reservationId: reserved.reservationId,
      eventId: input.eventId,
      email: input.contact.email,
      userId: opts.userId ?? null,
    });
  } catch (error) {
    // Never strand inventory behind a payment error.
    await release(prisma, reserved.reservationId);
    throw error;
  }

  await prisma.reservation.update({
    where: { id: reserved.reservationId },
    data: { stripePaymentIntentId: paymentIntent.paymentIntentId },
  });

  return { ...base, isFree: false, clientSecret: paymentIntent.clientSecret };
}

/** The all-items-failed response (no reservation taken / kept). */
function failureResponse(
  prepared: PreparedItem[],
  validatedItems?: ValidatedItem[]
): ValidationResponse {
  return {
    isValid: false,
    wasAdjusted: false,
    validatedItems:
      validatedItems ??
      prepared.map((p) => ({
        ticketTypeId: p.ticketTypeId,
        name: p.name,
        requestedQuantity: p.requested,
        validatedQuantity: 0,
        pricePerTicketCents: p.unitPriceCents,
        feesPerTicketCents: p.feesCents,
        message: p.fixedMessage ?? 'Sold Out',
      })),
    subtotalCents: 0,
    feesCents: 0,
    totalCents: 0,
    promotionApplied: null,
    message: 'All tickets are unavailable',
    isFree: false,
    reservationId: null,
    clientSecret: null,
    expiresAt: null,
  };
}
