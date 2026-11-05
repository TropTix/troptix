/**
 * Deliberately no authorization (ADR 0013) — these key off reservation /
 * payment-intent ids; who-can-do-what is the caller's job.
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
import type { CheckoutAnalytics, FulfilledVia } from '../contracts/analytics';
import type { CodeRefusal } from '../contracts/checkout';
import { generateId } from './_shared/ids';
import { calculateFeesCents } from './_shared/fees';
import { normalizeAccessCode } from './_shared/access-code';
import {
  retakeGrantUseInTx,
  returnGrantUseInTx,
  takeGrantUseInTx,
} from './_shared/grants';
import { NotFoundError } from './_shared/errors';

/**
 * Longer than the client's 10-min countdown on purpose: a payment submitted at
 * the buyer's deadline still has a buffer to settle (ADR 0018).
 */
export const HOLD_TTL_MINUTES = 12;
const DEFAULT_TTL_MINUTES = HOLD_TTL_MINUTES;

export interface ReserveItemInput {
  ticketTypeId: string;
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
  analytics?: {
    distinctId?: string | null;
    sessionId?: string | null;
  };
  userId?: string | null;
  /** The grant this hold takes a use of; the caller decided it applies. */
  grantId?: string | null;
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
  granted: boolean;
}

/**
 * FOR UPDATE serializes concurrent buyers of the same ticket type; the clamp
 * keeps the grant within live availability (NULL pre-cutover capacity → 0).
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
 * Every path that touches several ticket types walks them in id order, as
 * `deriveReserveItems` does for the hold, so two transactions cannot lock the
 * same rows in opposite orders.
 */
function inLockOrder<T extends { ticketTypeId: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.ticketTypeId.localeCompare(b.ticketTypeId)
  );
}

/** Locks the hold for the rest of the transaction; see `settle`. */
async function lockReservationInTx(
  tx: Prisma.TransactionClient,
  where: { id: string } | { stripePaymentIntentId: string }
): Promise<void> {
  if ('id' in where) {
    await tx.$queryRaw`SELECT id FROM "Reservation" WHERE id = ${where.id} FOR UPDATE`;
  } else {
    await tx.$queryRaw`SELECT id FROM "Reservation" WHERE "stripePaymentIntentId" = ${where.stripePaymentIntentId} FOR UPDATE`;
  }
}

/** Thrown inside `reserve`'s transaction so a refused grant takes nothing. */
export class GrantRefusedError extends Error {
  constructor(public readonly refusal: CodeRefusal) {
    super(`Grant refused the hold: ${refusal.type}`);
    this.name = 'GrantRefusedError';
  }
}

/**
 * The inventory hold, plus the grant's use when `grantId` is set — sale-window,
 * per-user-cap, and gating rules are the caller's job.
 */
export async function reserve(
  prisma: PrismaClient,
  input: ReserveInput
): Promise<ReserveResult> {
  const ttlMinutes = input.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
  const reservationId = generateId();

  return prisma.$transaction(async (tx) => {
    if (input.grantId) {
      const refusal = await takeGrantUseInTx(tx, input.grantId, now);
      if (refusal) throw new GrantRefusedError(refusal);
    }

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
    const anyGranted = grantedItems.some((g) => g.granted > 0);
    // A sold-out hold must not sit on a one-use grant until the sweep.
    if (input.grantId && !anyGranted) {
      await returnGrantUseInTx(tx, input.grantId);
    }

    await tx.reservation.create({
      data: {
        id: reservationId,
        status: ReservationStatus.HELD,
        expiresAt,
        email: input.contact?.email ?? null,
        firstName: input.contact?.firstName ?? null,
        lastName: input.contact?.lastName ?? null,
        posthogDistinctId: input.analytics?.distinctId ?? null,
        posthogSessionId: input.analytics?.sessionId ?? null,
        subtotalCents,
        feesCents,
        totalCents,
        event: { connect: { id: input.eventId } },
        ...(input.userId ? { user: { connect: { id: input.userId } } } : {}),
        ...(input.grantId && anyGranted
          ? { grant: { connect: { id: input.grantId } } }
          : {}),
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
      granted: anyGranted,
    };
  });
}

export type PricedTicketTypeRow = {
  id: string;
  priceCents: number | null;
  price: number;
  ticketingFees: string | null;
  maxPurchasePerUser: number;
  saleStartsAt: Date;
  saleEndsAt: Date;
  isDraft: boolean;
};

/** The grant a hold applies under: the types it covers and its per-checkout cap. */
export type ReserveGrant = {
  ticketTypeIds: ReadonlySet<string>;
  quantity: number | null;
};

/**
 * Prices come from the ticket type rows, never the client. Duplicate ids sum
 * before clamping (no cap stacking); sorted output gives deterministic lock
 * order. A grant's quantity replaces each covered type's own cap and bounds
 * their total, filled in that sorted order.
 */
export function deriveReserveItems(
  ticketTypes: PricedTicketTypeRow[],
  items: CreateReservationInput['items'],
  now: Date,
  grant: ReserveGrant | null = null
): ReserveItemInput[] {
  const byId = new Map(ticketTypes.map((t) => [t.id, t]));

  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(
      item.ticketTypeId,
      (totals.get(item.ticketTypeId) ?? 0) +
        Math.max(0, Math.floor(item.quantity))
    );
  }

  let grantLeft = grant?.quantity ?? Infinity;

  return Array.from(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ticketTypeId, requested]) => {
      const ticketType = byId.get(ticketTypeId);
      if (!ticketType) {
        throw new NotFoundError(
          `Ticket type ${ticketTypeId} is not available for this event.`
        );
      }

      const onSale =
        now >= ticketType.saleStartsAt && now <= ticketType.saleEndsAt;
      if (!onSale || ticketType.isDraft) {
        throw new NotFoundError(
          `Ticket type ${ticketTypeId} is not currently on sale.`
        );
      }

      const unitPriceCents =
        ticketType.priceCents ?? Math.round(ticketType.price * 100);
      const feesCents =
        ticketType.ticketingFees === 'PASS_TICKET_FEES'
          ? calculateFeesCents(unitPriceCents)
          : 0;
      const covered = grant?.ticketTypeIds.has(ticketTypeId) ?? false;
      if (!covered) {
        const quantity = Math.min(requested, ticketType.maxPurchasePerUser);
        return { ticketTypeId, quantity, unitPriceCents, feesCents };
      }
      const quantity = Math.min(
        requested,
        grant?.quantity ?? ticketType.maxPurchasePerUser,
        grantLeft
      );
      grantLeft -= quantity;
      return { ticketTypeId, quantity, unitPriceCents, feesCents };
    });
}

/**
 * `userId` comes from the actor, never the client. The code's grant applies
 * only when the order includes a type it lists; then it opens those types if
 * hidden, caps them, and takes a use with the hold.
 */
export async function createReservation(
  prisma: PrismaClient,
  input: CreateReservationInput,
  userId: string | null
): Promise<CreateReservationResponse> {
  const code = normalizeAccessCode(input.accessCode);
  const found =
    code === null
      ? null
      : await prisma.grant.findUnique({
          where: { eventId_code: { eventId: input.eventId, code } },
          select: {
            id: true,
            quantity: true,
            ticketTypes: { select: { ticketTypeId: true } },
          },
        });
  const grantTypeIds = new Set(
    found?.ticketTypes.map((t) => t.ticketTypeId) ?? []
  );
  const ticketTypeIds = input.items.map((i) => i.ticketTypeId);
  const grant =
    found && ticketTypeIds.some((id) => grantTypeIds.has(id))
      ? { id: found.id, ticketTypeIds: grantTypeIds, quantity: found.quantity }
      : null;

  const ticketTypes = await prisma.ticketTypes.findMany({
    where: {
      id: { in: ticketTypeIds },
      eventId: input.eventId,
      OR: [
        { hidden: false },
        ...(grant ? [{ id: { in: Array.from(grant.ticketTypeIds) } }] : []),
      ],
    },
    select: {
      id: true,
      priceCents: true,
      price: true,
      ticketingFees: true,
      maxPurchasePerUser: true,
      saleStartsAt: true,
      saleEndsAt: true,
      event: { select: { isDraft: true } },
    },
  });

  const pricedTicketTypes: PricedTicketTypeRow[] = ticketTypes.map((t) => ({
    id: t.id,
    priceCents: t.priceCents,
    price: t.price,
    ticketingFees: t.ticketingFees,
    maxPurchasePerUser: t.maxPurchasePerUser,
    saleStartsAt: t.saleStartsAt,
    saleEndsAt: t.saleEndsAt,
    isDraft: t.event.isDraft,
  }));

  const reserveItems = deriveReserveItems(
    pricedTicketTypes,
    input.items,
    new Date(),
    grant
  );

  let result: ReserveResult;
  try {
    result = await reserve(prisma, {
      eventId: input.eventId,
      items: reserveItems,
      contact: input.contact,
      analytics: input.analytics,
      userId,
      grantId: grant?.id ?? null,
    });
  } catch (err) {
    if (err instanceof GrantRefusedError) return err.refusal;
    throw err;
  }

  return {
    type: 'held',
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
  alreadyProcessed: boolean;
}

type ReservationWithItems = Prisma.ReservationGetPayload<{
  include: { items: true };
}>;

/**
 * Caller has already checked the reservation is HELD. The confirmation email
 * is the caller's job, after commit — never inside this transaction.
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

  const ticketRows: Prisma.TicketsCreateManyOrderInput[] = [];
  for (const item of inLockOrder(reservation.items)) {
    await tx.ticketTypes.update({
      where: { id: item.ticketTypeId },
      data: {
        reserved: { decrement: item.quantity },
        sold: { increment: item.quantity },
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
    await lockReservationInTx(tx, {
      stripePaymentIntentId: input.paymentIntentId,
    });
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
  | { kind: 'needs_refund' }
  | { kind: 'already_refunded' };

/** Thrown inside `settle`'s transaction to roll back a partial re-acquire. */
class NeedsRefundError extends Error {}

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
      // The webhook and sync poll can race; without this row lock both could
      // read HELD under READ COMMITTED and both materialize — a double order.
      await lockReservationInTx(tx, { id: input.reservationId });

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
        // EXPIRED / RELEASED — re-acquire the grant's use and the exact
        // quantities; any shortfall throws to roll back the whole re-acquire
        // and signal a refund.
        if (
          reservation.grantId &&
          !(await retakeGrantUseInTx(tx, reservation.grantId))
        ) {
          throw new NeedsRefundError();
        }
        for (const item of inLockOrder(reservation.items)) {
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
 * Called after the converting transaction commits — never inside it — and
 * swallows every error: analytics must never affect checkout.
 */
export async function captureOrderCompleted(
  prisma: PrismaClient,
  analytics: CheckoutAnalytics,
  reservationId: string,
  orderId: string,
  fulfilledVia: FulfilledVia
): Promise<void> {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { items: { select: { quantity: true } } },
    });
    if (!reservation) return;
    await analytics.orderCompleted({
      orderId,
      reservationId,
      eventId: reservation.eventId,
      orderType: reservation.totalCents === 0 ? 'FREE' : 'PAID',
      totalCents: reservation.totalCents,
      subtotalCents: reservation.subtotalCents,
      feesCents: reservation.feesCents,
      ticketCount: reservation.items.reduce((sum, i) => sum + i.quantity, 0),
      distinctId: reservation.posthogDistinctId,
      sessionId: reservation.posthogSessionId,
      fulfilledVia,
    });
  } catch {
    // Swallow — a failed capture must not surface to the buyer.
  }
}

export async function completeFree(
  prisma: PrismaClient,
  input: CompleteFreeInput,
  analytics?: CheckoutAnalytics
): Promise<CompleteFreeResponse> {
  const { orderId, fresh } = await prisma.$transaction(async (tx) => {
    // Without the lock a release committing mid-way would return the hold's
    // inventory and grant use while this still issues the tickets.
    await lockReservationInTx(tx, { id: input.reservationId });
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
      return { orderId: reservation.orderId, fresh: false };
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

    return { orderId: await materializeOrder(tx, reservation), fresh: true };
  });

  if (fresh && analytics) {
    await captureOrderCompleted(
      prisma,
      analytics,
      input.reservationId,
      orderId,
      'free'
    );
  }

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

async function releaseHeldInTx(
  tx: Prisma.TransactionClient,
  reservationId: string,
  toStatus: ReservationStatus
): Promise<boolean> {
  // The conditional transition locks the row, so a client release racing the
  // sweep returns inventory and the grant's use once, not twice.
  const { count } = await tx.reservation.updateMany({
    where: { id: reservationId, status: ReservationStatus.HELD },
    data: { status: toStatus },
  });
  if (count === 0) return false;

  const reservation = await tx.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: { items: true },
  });
  if (reservation.grantId) {
    await returnGrantUseInTx(tx, reservation.grantId);
  }
  for (const item of inLockOrder(reservation.items)) {
    await tx.ticketTypes.update({
      where: { id: item.ticketTypeId },
      data: { reserved: { decrement: item.quantity } },
    });
  }
  return true;
}

export async function release(
  prisma: PrismaClient,
  reservationId: string
): Promise<boolean> {
  return prisma.$transaction((tx) =>
    releaseHeldInTx(tx, reservationId, ReservationStatus.RELEASED)
  );
}

/**
 * Never call on a hold whose Session might still be payable — the sweep
 * expires the Stripe Session before this.
 */
export async function expireHold(
  prisma: PrismaClient,
  reservationId: string
): Promise<boolean> {
  return prisma.$transaction((tx) =>
    releaseHeldInTx(tx, reservationId, ReservationStatus.EXPIRED)
  );
}

/**
 * Superseded by payments.sweepExpiredHolds for the live app, which expires
 * Stripe Sessions first. Stays for no-Session holds and tests.
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
