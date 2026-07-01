/**
 * Reservation-based inventory primitives (roadmap reservation rebuild, Phase B).
 *
 * The only operation that needs a database-level atomicity guarantee is the
 * inventory hold; it is a single race-safe SQL statement (see `reserve`). The
 * rest (`confirm` / `release` / `expire`) are ordinary Prisma transactions — no
 * stored procedures (ADR 0007).
 *
 * Each function takes the Prisma client as its first argument (injected, not
 * imported) so services are framework-agnostic and unit-testable. They are
 * actor-agnostic — they key off reservation / payment-intent ids, so they carry
 * no authorization (ADR 0013); the caller is responsible for who-can-do-what.
 */
import {
  OrderStatus,
  OrderType,
  Prisma,
  ReservationStatus,
  TicketStatus,
  TicketType,
} from '@troptix/db';
import type { PrismaClient } from '@troptix/db';
import type {
  CreateReservationInput,
  CreateReservationResponse,
  CompleteFreeInput,
  CompleteFreeResponse,
} from '../contracts/reservations';
import { generateId } from './_shared/ids';
import { calculateFeesCents } from './_shared/fees';
import { NotFoundError } from './_shared/errors';

/**
 * Server-side hold lifetime. The client shows a shorter deadline (10 min) than
 * this so payments submitted right at the buyer's countdown still have a buffer
 * to settle + have their webhook delivered before the server releases the hold —
 * shrinking the paid-after-expiry refund race (ADR 0018).
 */
export const HOLD_TTL_MINUTES = 12;
const DEFAULT_TTL_MINUTES = HOLD_TTL_MINUTES;

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
 * Atomically hold `requested` units of one ticket type, returning the granted
 * count (clamped to live availability). One race-safe statement: the `FOR
 * UPDATE` in the CTE serializes concurrent buyers of the same ticket type, so
 * the last ticket can never be granted twice; `GREATEST/LEAST` keep the grant
 * within `[0, capacity - reserved - sold]` (a NULL capacity pre-cutover yields
 * availability 0, so it simply can't oversell). Shared by the initial hold
 * (`reserve`) and the paid-after-expiry re-acquire (`settle`).
 */
async function holdInventoryInTx(
  tx: Prisma.TransactionClient,
  ticketTypeId: string,
  requested: number
): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ granted: number }>>(Prisma.sql`
    WITH locked AS (
      SELECT id, GREATEST("capacity" - "reserved" - "sold", 0) AS avail
      FROM "TicketTypes"
      WHERE id = ${ticketTypeId}
      FOR UPDATE
    )
    UPDATE "TicketTypes" t
    SET "reserved" = t."reserved" + LEAST(${requested}::int, locked.avail)
    FROM locked
    WHERE t.id = locked.id
    RETURNING LEAST(${requested}::int, locked.avail)::int AS granted
  `);
  return rows[0]?.granted ?? 0;
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
export async function reserve(
  prisma: PrismaClient,
  input: ReserveInput
): Promise<ReserveResult> {
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
        granted = await holdInventoryInTx(tx, item.ticketTypeId, requested);
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

      grantedItems.push({
        ticketTypeId: item.ticketTypeId,
        requested,
        granted,
      });
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

/** The tier columns the pricing authority needs. */
export type PricedTierRow = {
  id: string;
  priceCents: number | null;
  price: number;
  ticketingFees: string | null;
  maxPurchasePerUser: number;
};

/**
 * Server-side pricing authority (pure): map a client selection onto reserve
 * items, deriving unit price + fees from the tier rows (ignoring any client
 * price), and clamping each quantity to max-per-user. Throws `NotFoundError` for
 * any requested tier that wasn't returned (missing, gated, or wrong event).
 */
export function deriveReserveItems(
  tiers: PricedTierRow[],
  items: CreateReservationInput['items']
): ReserveItemInput[] {
  const byId = new Map(tiers.map((t) => [t.id, t]));
  return items.map((item) => {
    const tier = byId.get(item.ticketTypeId);
    if (!tier) {
      throw new NotFoundError(
        `Ticket type ${item.ticketTypeId} is not available for this event.`
      );
    }
    const unitPriceCents = tier.priceCents ?? Math.round(tier.price * 100);
    const feesCents =
      tier.ticketingFees === 'PASS_TICKET_FEES'
        ? calculateFeesCents(unitPriceCents)
        : 0;
    const quantity = Math.max(
      0,
      Math.min(Math.floor(item.quantity), tier.maxPurchasePerUser)
    );
    return { ticketTypeId: tier.id, quantity, unitPriceCents, feesCents };
  });
}

/**
 * Create a hold from a client selection. The server is the pricing authority: it
 * ignores any client-sent price and derives unit price + fees from `TicketTypes`,
 * validates each tier is public and belongs to the event, clamps to max-per-user,
 * then calls `reserve()` (which clamps to live availability). `userId` comes from
 * the actor, never the client.
 */
export async function createReservation(
  prisma: PrismaClient,
  input: CreateReservationInput,
  userId: string | null
): Promise<CreateReservationResponse> {
  const tierIds = input.items.map((i) => i.ticketTypeId);
  const tiers = await prisma.ticketTypes.findMany({
    where: {
      id: { in: tierIds },
      eventId: input.eventId,
      // Public tiers only — gated tiers must be unlocked via a code first.
      OR: [
        { discountCode: { equals: null } },
        { discountCode: { equals: '' } },
      ],
    },
    select: {
      id: true,
      priceCents: true,
      price: true,
      ticketingFees: true,
      maxPurchasePerUser: true,
    },
  });

  const reserveItems = deriveReserveItems(tiers, input.items);

  const result = await reserve(prisma, {
    eventId: input.eventId,
    items: reserveItems,
    contact: input.contact,
    userId,
  });

  return {
    reservationId: result.reservationId,
    items: result.items,
    totalCents: result.totalCents,
    expiresAt: result.expiresAt.toISOString(),
    wasAdjusted: result.items.some((g) => g.granted < g.requested),
  };
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
 * move `reserved → sold`, create the Order + one Ticket per unit (VALID), and
 * mark the reservation CONVERTED. The confirmation email is sent by the caller
 * after commit (never inside this transaction).
 *
 * Idempotent: Stripe delivers webhooks at-least-once, so a second call for an
 * already-CONVERTED reservation is a no-op returning the existing order id.
 */
type ReservationWithItems = Prisma.ReservationGetPayload<{
  include: { items: true };
}>;

/**
 * Shared order materialization: move reserved → sold, create the Order + one
 * VALID Ticket per unit, mark the reservation CONVERTED, and enqueue the
 * confirmation email. Used by both the paid webhook path (`confirm`) and the
 * free path (`completeFree`). Assumes the caller has already loaded the
 * reservation and checked it is HELD.
 */
async function materializeOrder(
  tx: Prisma.TransactionClient,
  reservation: ReservationWithItems,
  opts: {
    paymentIntentId?: string | null;
    cardType?: string | null;
    cardLast4?: string | null;
  } = {}
): Promise<string> {
  const isFree = reservation.totalCents === 0;
  const orderType = isFree ? OrderType.FREE : OrderType.PAID;
  const ticketsType = isFree ? TicketType.FREE : TicketType.PAID;

  // In one pass per item: move reserved → sold (dual-writing the legacy
  // `quantitySold` until Phase C swaps the dashboard read to `sold`), and build
  // one VALID ticket row per reserved unit.
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
      stripePaymentId: opts.paymentIntentId ?? null,
      total: reservation.totalCents / 100,
      subtotal: reservation.subtotalCents / 100,
      fees: reservation.feesCents / 100,
      totalCents: reservation.totalCents,
      subtotalCents: reservation.subtotalCents,
      feesCents: reservation.feesCents,
      firstName: reservation.firstName,
      lastName: reservation.lastName,
      email: reservation.email,
      cardType: opts.cardType ?? null,
      cardLast4: opts.cardLast4 ?? null,
      event: { connect: { id: reservation.eventId } },
      ...(reservation.userId
        ? { user: { connect: { id: reservation.userId } } }
        : {}),
      tickets: { createMany: { data: ticketRows } },
    },
  });

  await tx.reservation.update({
    where: { id: reservation.id },
    data: {
      status: ReservationStatus.CONVERTED,
      orderId,
      // Backfill the PaymentIntent id for refund traceability (paid path); the
      // paid flow keys off the Checkout Session, so this is set here at confirm.
      ...(opts.paymentIntentId
        ? { stripePaymentIntentId: opts.paymentIntentId }
        : {}),
    },
  });

  return orderId;
}

export async function confirm(
  prisma: PrismaClient,
  input: ConfirmInput
): Promise<ConfirmResult> {
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

    const orderId = await materializeOrder(tx, reservation, {
      paymentIntentId: input.paymentIntentId,
      cardType: input.cardType,
      cardLast4: input.cardLast4,
    });
    return { orderId, alreadyProcessed: false };
  });
}

export interface SettleInput {
  reservationId: string;
  paymentIntentId: string;
  cardType?: string | null;
  cardLast4?: string | null;
}

export type SettleResult =
  | { kind: 'converted'; orderId: string; alreadyProcessed: boolean }
  /** Paid after the hold expired and the tickets could not be re-acquired. */
  | { kind: 'needs_refund' }
  /** Already auto-refunded on a prior attempt (idempotent). */
  | { kind: 'already_refunded' };

/** Thrown inside `settle`'s transaction to roll back a partial re-acquire. */
class NeedsRefundError extends Error {}

/**
 * Settle a paid reservation whose payment has succeeded — the Stripe-free core
 * of the paid path, shared by the webhook and the confirmation poll (ADR 0018).
 * The Stripe orchestration (session retrieval, `refunds.create`) lives in
 * `services/payments.ts`; this only touches the database and is fully testable
 * against Postgres alone.
 *
 * - HELD → materialize the order (move `reserved → sold`, create Order +
 *   VALID tickets, mark CONVERTED).
 * - CONVERTED / REFUNDED → idempotent no-op (duplicate webhook / poll race).
 * - EXPIRED or RELEASED → the hold was already released. Re-acquire the exact
 *   quantities atomically; if all are re-granted, materialize as normal, else
 *   roll back and return `needs_refund` so the caller refunds the whole charge.
 */
export async function settle(
  prisma: PrismaClient,
  input: SettleInput
): Promise<SettleResult> {
  const opts = {
    paymentIntentId: input.paymentIntentId,
    cardType: input.cardType,
    cardLast4: input.cardLast4,
  };
  try {
    return await prisma.$transaction(async (tx) => {
      // Serialize concurrent settles of the same reservation (the webhook and
      // the sync-fulfillment poll can race). Without this row lock, both could
      // read HELD under READ COMMITTED and both materialize — a double order /
      // oversell. FOR UPDATE makes the loser block, then re-read CONVERTED.
      await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${input.reservationId} FOR UPDATE`;

      const reservation = await tx.reservation.findUnique({
        where: { id: input.reservationId },
        include: { items: true },
      });

      if (!reservation) {
        throw new NotFoundError(
          `Reservation ${input.reservationId} not found.`
        );
      }

      if (reservation.status === ReservationStatus.CONVERTED) {
        if (!reservation.orderId) {
          throw new Error(
            `Reservation ${reservation.id} is CONVERTED but has no orderId`
          );
        }
        return {
          kind: 'converted' as const,
          orderId: reservation.orderId,
          alreadyProcessed: true,
        };
      }

      if (reservation.status === ReservationStatus.REFUNDED) {
        return { kind: 'already_refunded' as const };
      }

      if (reservation.status !== ReservationStatus.HELD) {
        // EXPIRED / RELEASED — the hold was handed back. Try to re-acquire the
        // exact quantities; any shortfall rolls back the whole re-acquire (the
        // throw aborts the transaction) and signals a refund.
        for (const item of reservation.items) {
          const granted = await holdInventoryInTx(
            tx,
            item.ticketTypeId,
            item.quantity
          );
          if (granted < item.quantity) {
            throw new NeedsRefundError();
          }
        }
      }

      const orderId = await materializeOrder(tx, reservation, opts);
      return {
        kind: 'converted' as const,
        orderId,
        alreadyProcessed: false,
      };
    });
  } catch (err) {
    if (err instanceof NeedsRefundError) {
      return { kind: 'needs_refund' };
    }
    throw err;
  }
}

/**
 * Finalize a FREE reservation (no PaymentIntent) by id. Guards that it is HELD
 * and actually free, then materializes the order. Idempotent — a second call for
 * an already-CONVERTED reservation returns the existing order. Returns enough to
 * render the confirmation without a second round-trip.
 */
export async function completeFree(
  prisma: PrismaClient,
  input: CompleteFreeInput
): Promise<CompleteFreeResponse> {
  const orderId = await prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findUnique({
      where: { id: input.reservationId },
      include: { items: true },
    });

    if (!reservation) {
      throw new NotFoundError(`Reservation ${input.reservationId} not found.`);
    }

    if (reservation.status === ReservationStatus.CONVERTED) {
      if (!reservation.orderId) {
        throw new Error(
          `Reservation ${reservation.id} is CONVERTED but has no orderId`
        );
      }
      return reservation.orderId;
    }

    if (reservation.status !== ReservationStatus.HELD) {
      throw new Error(
        `Reservation ${reservation.id} is ${reservation.status}; cannot complete`
      );
    }

    if (reservation.totalCents !== 0) {
      throw new Error(
        `Reservation ${reservation.id} is not free; use the paid checkout flow.`
      );
    }

    return materializeOrder(tx, reservation);
  });

  const tickets = await prisma.tickets.findMany({
    where: { orderId },
    select: { id: true, ticketType: { select: { name: true } } },
  });

  return {
    orderId,
    tickets: tickets.map((t) => ({
      id: t.id,
      ticketTypeName: t.ticketType?.name ?? null,
    })),
  };
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
export async function release(
  prisma: PrismaClient,
  reservationId: string
): Promise<boolean> {
  return prisma.$transaction((tx) =>
    releaseHeldInTx(tx, reservationId, ReservationStatus.RELEASED)
  );
}

/**
 * Release inventory held by all HELD reservations past their TTL. Called by the
 * cron. Idempotent and concurrency-safe (each release re-checks status in its
 * own transaction). Returns the number of reservations expired.
 */
export async function expire(
  prisma: PrismaClient,
  now: Date = new Date()
): Promise<number> {
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
