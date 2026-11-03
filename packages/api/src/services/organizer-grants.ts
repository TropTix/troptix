// Access codes are managed by whoever manages the event's ticket types: the
// same scope, the same write rule (requireOwnedEvent).
import { Prisma, ReservationStatus } from '@troptix/db';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  createGrantInputSchema,
  updateGrantInputSchema,
  type CreateGrantInput,
  type GrantsView,
  type UpdateGrantInput,
  type ViewAsInput,
} from '../contracts/organizer';
import { generateAccessCode, normalizeAccessCode } from './_shared/access-code';
import { ConflictError, NotFoundError } from './_shared/errors';
import { deriveGrantState } from './_shared/grants';
import { generateId } from './_shared/ids';
import { requireOwnedEvent } from './_shared/owned-event';
import { eventsInScope, resolveOrganizerScope } from './organizer-scope';

const GENERATE_ATTEMPTS = 5;

export async function listGrants(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  input: ViewAsInput = {},
  now: Date = new Date()
): Promise<GrantsView> {
  const scope = await resolveOrganizerScope(
    prisma,
    actor,
    input.viewAsOrganizerUserId
  );

  const event = await prisma.events.findFirst({
    where: { id: eventId, ...eventsInScope(scope) },
    select: {
      ticketTypes: {
        select: { id: true, name: true, hidden: true },
        orderBy: { createdAt: 'asc' },
      },
      grants: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          code: true,
          maxUses: true,
          usedCount: true,
          quantity: true,
          expiresAt: true,
          revokedAt: true,
          holderEmail: true,
          holderName: true,
          sentAt: true,
          createdAt: true,
          ticketTypes: {
            select: { ticketType: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
  if (!event) {
    throw new NotFoundError('Event not found');
  }

  const held = await prisma.reservation.groupBy({
    by: ['grantId'],
    where: {
      grantId: { in: event.grants.map((g) => g.id) },
      status: ReservationStatus.HELD,
    },
  });
  const withHold = new Set(held.map((h) => h.grantId));

  return {
    ticketTypes: event.ticketTypes,
    grants: event.grants.map((g) => ({
      id: g.id,
      code: g.code,
      state: deriveGrantState(g, withHold.has(g.id), now),
      maxUses: g.maxUses,
      usedCount: g.usedCount,
      quantity: g.quantity,
      expiresAt: g.expiresAt?.toISOString() ?? null,
      revokedAt: g.revokedAt?.toISOString() ?? null,
      holderEmail: g.holderEmail,
      holderName: g.holderName,
      sentAt: g.sentAt?.toISOString() ?? null,
      createdAt: g.createdAt.toISOString(),
      checkoutInProgress: withHold.has(g.id),
      ticketTypes: g.ticketTypes.map((t) => t.ticketType),
    })),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

export async function createGrant(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  input: CreateGrantInput
): Promise<{ grantId: string; code: string }> {
  const data = createGrantInputSchema.parse(input);
  const scope = await resolveOrganizerScope(prisma, actor);
  await requireOwnedEvent(prisma, scope, eventId);

  const ticketTypeIds = Array.from(new Set(data.ticketTypeIds));
  const onEvent = await prisma.ticketTypes.count({
    where: { id: { in: ticketTypeIds }, eventId },
  });
  if (onEvent !== ticketTypeIds.length) {
    throw new NotFoundError('Ticket type not found');
  }

  const typed = normalizeAccessCode(data.code);
  const attempts = typed === null ? GENERATE_ATTEMPTS : 1;
  for (let attempt = 1; ; attempt++) {
    const code = typed ?? generateAccessCode();
    const grantId = generateId();
    try {
      await prisma.grant.create({
        data: {
          id: grantId,
          eventId,
          code,
          maxUses: data.maxUses,
          quantity: data.quantity,
          expiresAt: data.expiresAt,
          holderEmail: data.holderEmail ?? null,
          holderName: data.holderName || null,
          ticketTypes: {
            createMany: {
              data: ticketTypeIds.map((ticketTypeId) => ({ ticketTypeId })),
            },
          },
        },
      });
      return { grantId, code };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      if (attempt >= attempts) {
        throw new ConflictError(
          typed === null
            ? 'Could not generate a free code. Try again.'
            : `${code} is already a code on this event.`
        );
      }
    }
  }
}

async function requireOwnedGrant(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  grantId: string
): Promise<void> {
  const scope = await resolveOrganizerScope(prisma, actor);
  const grant = await prisma.grant.findFirst({
    where: { id: grantId, eventId, event: eventsInScope(scope) },
    select: { id: true },
  });
  if (!grant) {
    throw new NotFoundError('Access code not found');
  }
}

export async function updateGrant(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  grantId: string,
  input: UpdateGrantInput
): Promise<void> {
  const data = updateGrantInputSchema.parse(input);
  await requireOwnedGrant(prisma, actor, eventId, grantId);

  // Conditional on the count, so a hold landing between read and write can't
  // push maxUses under uses already taken.
  const { count } = await prisma.grant.updateMany({
    where: {
      id: grantId,
      ...(data.maxUses === null ? {} : { usedCount: { lte: data.maxUses } }),
    },
    data: {
      maxUses: data.maxUses,
      quantity: data.quantity,
      expiresAt: data.expiresAt,
    },
  });
  if (count === 0) {
    throw new ConflictError(
      'This code has already been used more times than that.'
    );
  }
}

/** Stops new checkouts only; an open hold may still be paid (plan decision 10). */
export async function revokeGrant(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  grantId: string,
  now: Date = new Date()
): Promise<void> {
  await requireOwnedGrant(prisma, actor, eventId, grantId);
  await prisma.grant.updateMany({
    where: { id: grantId, revokedAt: null },
    data: { revokedAt: now },
  });
}
