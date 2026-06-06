/**
 * Reservation-based inventory primitives (roadmap reservation rebuild, Phase B).
 *
 * The only operation that needs a database-level atomicity guarantee is the
 * inventory hold; it is a single race-safe SQL statement (see `reserve`). The
 * rest (`confirm` / `release` / `expire`) are ordinary Prisma transactions — no
 * stored procedures (ADR 0007).
 */
import prisma from '@/server/prisma';
import {
  OrderStatus,
  OrderType,
  Prisma,
  ReservationStatus,
  TicketStatus,
  TicketType,
} from '@prisma/client';
import { generateId } from '@/lib/utils';

const DEFAULT_TTL_MINUTES = 10;

export interface ReserveItemInput {
  ticketTypeId: string;
  /** Requested quantity — already clamped to maxPurchasePerUser / sale window by the caller. */
  quantity: number;
  unitPriceCents: number;
  feesCents: number;
}

export interface ReserveInput {
  eventId: string;
  items: ReserveItemInput[];
  contact?: {
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
  userId?: string | null;
  ttlMinutes?: number;
}

export interface ReserveGrantedItem {
  ticketTypeId: string;
  requested: number;
  granted: number;
}

export interface ReserveResult {
  reservationId: string;
  items: ReserveGrantedItem[];
  subtotalCents: number;
  feesCents: number;
  totalCents: number;
  expiresAt: Date;
  /** True if any quantity was granted; false ⇒ everything was sold out. */
  granted: boolean;
}

/**
 * Atomically hold inventory for a set of ticket types.
 *
 * Per item, one race-safe statement clamps the grant to availability
 * (`capacity - reserved - sold`) and increments `reserved`. The `FOR UPDATE`
 * in the CTE serializes concurrent buyers of the same ticket type, so the last
 * ticket can never be granted twice. Returns the granted-per-item breakdown so
 * the caller can surface a "we reduced your quantity" (wasAdjusted) message.
 *
 * Business rules (maxPurchasePerUser, sale window, password gating) are the
 * caller's responsibility — this is purely the inventory hold.
 */
export async function reserve(input: ReserveInput): Promise<ReserveResult> {
  const ttlMinutes = input.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const reservationId = generateId();

  return prisma.$transaction(async (tx) => {
    const grantedItems: ReserveGrantedItem[] = [];
    const itemRows: Prisma.ReservationItemCreateManyReservationInput[] = [];
    let subtotalCents = 0;
    let feesCents = 0;

    for (const item of input.items) {
      const requested = Math.max(0, Math.floor(item.quantity));
      let granted = 0;

      if (requested > 0) {
        // Lock the ticket-type row, clamp the grant to current availability,
        // and increment reserved — all in one statement. GREATEST/LEAST keep
        // the grant within [0, available]; a NULL capacity (pre-cutover) yields
        // availability 0, so it simply can't oversell.
        const rows = await tx.$queryRaw<Array<{ granted: number }>>(Prisma.sql`
          WITH locked AS (
            SELECT id, GREATEST("capacity" - "reserved" - "sold", 0) AS avail
            FROM "TicketTypes"
            WHERE id = ${item.ticketTypeId}
            FOR UPDATE
          )
          UPDATE "TicketTypes" t
          SET "reserved" = t."reserved" + LEAST(${requested}::int, locked.avail)
          FROM locked
          WHERE t.id = locked.id
          RETURNING LEAST(${requested}::int, locked.avail)::int AS granted
        `);
        granted = rows[0]?.granted ?? 0;
      }

      if (granted > 0) {
        itemRows.push({
          id: generateId(),
          ticketTypeId: item.ticketTypeId,
          quantity: granted,
          unitPriceCents: item.unitPriceCents,
          feesCents: item.feesCents,
        });
        subtotalCents += granted * item.unitPriceCents;
        feesCents += granted * item.feesCents;
      }

      grantedItems.push({ ticketTypeId: item.ticketTypeId, requested, granted });
    }

    const totalCents = subtotalCents + feesCents;

    // One write: create the hold with its items and final totals already known.
    await tx.reservation.create({
      data: {
        id: reservationId,
        status: ReservationStatus.HELD,
        expiresAt,
        email: input.contact?.email ?? null,
        firstName: input.contact?.firstName ?? null,
        lastName: input.contact?.lastName ?? null,
        subtotalCents,
        feesCents,
        totalCents,
        event: { connect: { id: input.eventId } },
        ...(input.userId ? { user: { connect: { id: input.userId } } } : {}),
        items: { createMany: { data: itemRows } },
      },
    });

    return {
      reservationId,
      items: grantedItems,
      subtotalCents,
      feesCents,
      totalCents,
      expiresAt,
      granted: grantedItems.some((g) => g.granted > 0),
    };
  });
}

export interface ConfirmInput {
  paymentIntentId: string;
  cardType?: string | null;
  cardLast4?: string | null;
}

export interface ConfirmResult {
  orderId: string;
  /** True when this was a duplicate webhook delivery (no-op). */
  alreadyProcessed: boolean;
}

/**
 * Materialize a paid (or free) order from a held reservation, atomically:
 * move `reserved → sold`, create the Order + one Ticket per unit (VALID), mark
 * the reservation CONVERTED, and enqueue the confirmation email in the outbox
 * (sent after commit — never inside this transaction).
 *
 * Idempotent: Stripe delivers webhooks at-least-once, so a second call for an
 * already-CONVERTED reservation is a no-op returning the existing order id.
 */
export async function confirm(input: ConfirmInput): Promise<ConfirmResult> {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { stripePaymentIntentId: input.paymentIntentId },
      include: { items: true },
    });

    if (!reservation) {
      throw new Error(
        `No reservation found for payment intent ${input.paymentIntentId}`
      );
    }

    if (reservation.status === ReservationStatus.CONVERTED) {
      if (!reservation.orderId) {
        throw new Error(
          `Reservation ${reservation.id} is CONVERTED but has no orderId`
        );
      }
      return { orderId: reservation.orderId, alreadyProcessed: true };
    }

    if (reservation.status !== ReservationStatus.HELD) {
      throw new Error(
        `Reservation ${reservation.id} is ${reservation.status}; cannot confirm`
      );
    }

    const isFree = reservation.totalCents === 0;
    const orderType = isFree ? OrderType.FREE : OrderType.PAID;
    const ticketsType = isFree ? TicketType.FREE : TicketType.PAID;

    // In one pass per item: move reserved → sold (dual-writing the legacy
    // `quantitySold` until Phase C swaps the dashboard read to `sold`), and
    // build one VALID ticket row per reserved unit.
    const ticketRows: Prisma.TicketsCreateManyOrderInput[] = [];
    for (const item of reservation.items) {
      await tx.ticketTypes.update({
        where: { id: item.ticketTypeId },
        data: {
          reserved: { decrement: item.quantity },
          sold: { increment: item.quantity },
          quantitySold: { increment: item.quantity },
        },
      });

      for (let i = 0; i < item.quantity; i++) {
        ticketRows.push({
          id: generateId(),
          status: TicketStatus.VALID,
          ticketsType,
          subtotal: item.unitPriceCents / 100,
          fees: item.feesCents / 100,
          total: (item.unitPriceCents + item.feesCents) / 100,
          firstName: reservation.firstName,
          lastName: reservation.lastName,
          email: reservation.email,
          eventId: reservation.eventId,
          ticketTypeId: item.ticketTypeId,
          ...(reservation.userId ? { userId: reservation.userId } : {}),
        });
      }
    }

    const orderId = generateId();
    await tx.orders.create({
      data: {
        id: orderId,
        status: OrderStatus.COMPLETED,
        type: orderType,
        stripePaymentId: input.paymentIntentId,
        total: reservation.totalCents / 100,
        subtotal: reservation.subtotalCents / 100,
        fees: reservation.feesCents / 100,
        totalCents: reservation.totalCents,
        subtotalCents: reservation.subtotalCents,
        feesCents: reservation.feesCents,
        firstName: reservation.firstName,
        lastName: reservation.lastName,
        email: reservation.email,
        cardType: input.cardType ?? null,
        cardLast4: input.cardLast4 ?? null,
        event: { connect: { id: reservation.eventId } },
        ...(reservation.userId
          ? { user: { connect: { id: reservation.userId } } }
          : {}),
        tickets: { createMany: { data: ticketRows } },
      },
    });

    await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.CONVERTED, orderId },
    });

    await tx.outboxMessage.create({
      data: {
        id: generateId(),
        type: 'order_confirmation',
        payload: { orderId },
      },
    });

    return { orderId, alreadyProcessed: false };
  });
}

/**
 * Release a single HELD reservation's inventory and mark it `toStatus`.
 * Returns false if the reservation isn't HELD (already converted/released/
 * expired) — making release/expire idempotent and safe against double runs.
 */
async function releaseHeldInTx(
  tx: Prisma.TransactionClient,
  reservationId: string,
  toStatus: ReservationStatus
): Promise<boolean> {
  const reservation = await tx.reservation.findUnique({
    where: { id: reservationId },
    include: { items: true },
  });
  if (!reservation || reservation.status !== ReservationStatus.HELD) {
    return false;
  }
  for (const item of reservation.items) {
    await tx.ticketTypes.update({
      where: { id: item.ticketTypeId },
      data: { reserved: { decrement: item.quantity } },
    });
  }
  await tx.reservation.update({
    where: { id: reservationId },
    data: { status: toStatus },
  });
  return true;
}

/** Hand a held reservation's inventory back (e.g. user abandons checkout). */
export async function release(reservationId: string): Promise<boolean> {
  return prisma.$transaction((tx) =>
    releaseHeldInTx(tx, reservationId, ReservationStatus.RELEASED)
  );
}

/**
 * Release inventory held by all HELD reservations past their TTL. Called by the
 * cron. Idempotent and concurrency-safe (each release re-checks status in its
 * own transaction). Returns the number of reservations expired.
 */
export async function expire(now: Date = new Date()): Promise<number> {
  const expired = await prisma.reservation.findMany({
    where: { status: ReservationStatus.HELD, expiresAt: { lt: now } },
    select: { id: true },
  });

  let count = 0;
  for (const { id } of expired) {
    const released = await prisma.$transaction((tx) =>
      releaseHeldInTx(tx, id, ReservationStatus.EXPIRED)
    );
    if (released) count++;
  }
  return count;
}
