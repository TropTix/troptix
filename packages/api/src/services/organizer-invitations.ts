// Invitations are grants with a holder (guest access plan, decisions 20–24).
// This service writes the grants and reserves the send; the caller owns the
// email transport and reports a failed send back with releaseInvitationSend.
import { Prisma } from '@troptix/db';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import {
  INVITE_DAILY_MAX,
  INVITE_RESEND_INTERVAL_MS,
  inviteGuestsInputSchema,
  type InviteGuestsInput,
  type InviteGuestsResult,
} from '../contracts/organizer';
import { generateAccessCode } from './_shared/access-code';
import {
  ConflictError,
  InvitationLimitError,
  InvitationsNotAllowedError,
  NotFoundError,
} from './_shared/errors';
import { deriveGrantState } from './_shared/grants';
import { generateId } from './_shared/ids';
import { eventsInScope, resolveOrganizerScope } from './organizer-scope';

const DAY_MS = 86_400_000;
// A batch can wait on another batch's lock; Prisma's 5s default is too short.
const LOCKED_TX = { maxWait: 10_000, timeout: 20_000 };

/** What the transport needs to send one invitation. */
export type InvitationToSend = {
  grantId: string;
  /** Stamped before sending; pass it back to releaseInvitationSend on failure. */
  sentAt: Date;
  previousSentAt: Date | null;
  to: string;
  /** The organization owner, so a guest's reply reaches a person. */
  replyTo: string | null;
  invite: {
    eventId: string;
    eventName: string;
    organizationName: string;
    startsAt: Date;
    code: string;
    quantity: number | null;
    expiresAt: Date | null;
  };
};

const eventForInviteSelect = {
  id: true,
  name: true,
  startsAt: true,
  organization: {
    select: {
      id: true,
      displayName: true,
      verified: true,
      paidTicketingEnabled: true,
      owner: { select: { email: true } },
    },
  },
} satisfies Prisma.EventsSelect;

type EventForInvite = Prisma.EventsGetPayload<{
  select: typeof eventForInviteSelect;
}>;

async function ownedEventForInvite(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string
): Promise<EventForInvite> {
  const scope = await resolveOrganizerScope(prisma, actor);
  const event = await prisma.events.findFirst({
    where: { id: eventId, ...eventsInScope(scope) },
    select: eventForInviteSelect,
  });
  if (!event) {
    throw new NotFoundError('Event not found');
  }
  return event;
}

function assertMaySend(event: EventForInvite) {
  const org = event.organization;
  if (!org.verified && !org.paidTicketingEnabled) {
    throw new InvitationsNotAllowedError();
  }
}

/**
 * Serializes invitation writes per organization, so two batches can neither
 * both pass the daily cap nor both invite the same address.
 */
async function lockInvitesInTx(
  tx: Prisma.TransactionClient,
  organizationId: string
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invite-sends:${organizationId}`}))`;
}

/**
 * Counts invitations stamped in the last 24 hours across the organization's
 * events. A resend restamps a grant, so it may happen once a day per grant;
 * otherwise a resend would send without being counted.
 */
async function assertSendQuotaInTx(
  tx: Prisma.TransactionClient,
  organizationId: string,
  count: number,
  now: Date
) {
  const sent = await tx.grant.count({
    where: {
      sentAt: { gt: new Date(now.getTime() - DAY_MS) },
      event: { organizationId },
    },
  });
  if (sent + count > INVITE_DAILY_MAX) {
    throw new InvitationLimitError(Math.max(0, INVITE_DAILY_MAX - sent));
  }
}

function toSend(
  event: EventForInvite,
  grant: {
    id: string;
    code: string;
    holderEmail: string;
    quantity: number | null;
    expiresAt: Date | null;
  },
  sentAt: Date,
  previousSentAt: Date | null
): InvitationToSend {
  return {
    grantId: grant.id,
    sentAt,
    previousSentAt,
    to: grant.holderEmail,
    replyTo: event.organization.owner.email,
    invite: {
      eventId: event.id,
      eventName: event.name,
      organizationName: event.organization.displayName,
      startsAt: event.startsAt,
      code: grant.code,
      quantity: grant.quantity,
      expiresAt: grant.expiresAt,
    },
  };
}

/** Eight characters from 32 make a clash a 1-in-10¹² event; checked anyway. */
async function freshCodes(
  tx: Prisma.TransactionClient,
  eventId: string,
  count: number
): Promise<string[]> {
  const codes = new Set<string>();
  while (codes.size < count) {
    const batch = Array.from(
      { length: count - codes.size },
      generateAccessCode
    );
    const taken = await tx.grant.findMany({
      where: { eventId, code: { in: batch } },
      select: { code: true },
    });
    const takenSet = new Set(taken.map((t) => t.code));
    for (const code of batch) if (!takenSet.has(code)) codes.add(code);
  }
  return Array.from(codes);
}

export async function inviteGuests(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  input: InviteGuestsInput,
  now: Date = new Date()
): Promise<InviteGuestsResult & { toSend: InvitationToSend[] }> {
  const data = inviteGuestsInputSchema.parse(input);
  const event = await ownedEventForInvite(prisma, actor, eventId);
  if (data.send) assertMaySend(event);

  const ticketTypeIds = Array.from(new Set(data.ticketTypeIds));
  const onEvent = await prisma.ticketTypes.count({
    where: { id: { in: ticketTypeIds }, eventId },
  });
  if (onEvent !== ticketTypeIds.length) {
    throw new NotFoundError('Ticket type not found');
  }

  const skipped: InviteGuestsResult['skipped'] = [];
  const unique: string[] = [];
  for (const email of data.emails) {
    if (unique.includes(email)) skipped.push({ email, reason: 'duplicate' });
    else unique.push(email);
  }

  return prisma.$transaction(async (tx) => {
    await lockInvitesInTx(tx, event.organization.id);
    const existing = await tx.grant.findMany({
      where: { eventId, holderEmail: { in: unique }, revokedAt: null },
      select: {
        holderEmail: true,
        maxUses: true,
        usedCount: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    // Only an active invitation can be resent, so only one blocks a new one.
    const invited = new Set(
      existing
        .filter((g) => deriveGrantState(g, false, now) === 'active')
        .map((g) => g.holderEmail)
    );
    const fresh = unique.filter((email) => {
      if (!invited.has(email)) return true;
      skipped.push({ email, reason: 'alreadyInvited' });
      return false;
    });
    if (fresh.length === 0) return { created: [], skipped, toSend: [] };

    if (data.send) {
      await assertSendQuotaInTx(tx, event.organization.id, fresh.length, now);
    }

    const codes = await freshCodes(tx, eventId, fresh.length);
    const grants = fresh.map((holderEmail, i) => ({
      id: generateId(),
      eventId,
      code: codes[i],
      holderEmail,
      maxUses: data.maxUses,
      quantity: data.quantity,
      expiresAt: data.expiresAt,
      sentAt: data.send ? now : null,
    }));
    await tx.grant.createMany({ data: grants });
    await tx.grantTicketType.createMany({
      data: grants.flatMap((g) =>
        ticketTypeIds.map((ticketTypeId) => ({ grantId: g.id, ticketTypeId }))
      ),
    });

    return {
      created: grants.map((g) => ({
        grantId: g.id,
        email: g.holderEmail,
        code: g.code,
      })),
      skipped,
      toSend: data.send ? grants.map((g) => toSend(event, g, now, null)) : [],
    };
  }, LOCKED_TX);
}

/** Same code again; offered only while the grant is active (plan decision 23). */
export async function resendInvitation(
  prisma: PrismaClient,
  actor: Actor,
  eventId: string,
  grantId: string,
  now: Date = new Date()
): Promise<InvitationToSend> {
  const event = await ownedEventForInvite(prisma, actor, eventId);
  assertMaySend(event);

  return prisma.$transaction(async (tx) => {
    await lockInvitesInTx(tx, event.organization.id);
    const grant = await tx.grant.findFirst({
      where: { id: grantId, eventId },
      select: {
        id: true,
        code: true,
        holderEmail: true,
        maxUses: true,
        usedCount: true,
        quantity: true,
        expiresAt: true,
        revokedAt: true,
        sentAt: true,
      },
    });
    if (!grant?.holderEmail) {
      throw new NotFoundError('Invitation not found');
    }
    if (deriveGrantState(grant, false, now) !== 'active') {
      throw new ConflictError(
        'Only an active invitation can be resent. Extend it or add uses first.'
      );
    }

    if (
      grant.sentAt &&
      now.getTime() - grant.sentAt.getTime() < INVITE_RESEND_INTERVAL_MS
    ) {
      throw new ConflictError(
        'This invitation was sent less than a day ago. Try again tomorrow.'
      );
    }
    await assertSendQuotaInTx(tx, event.organization.id, 1, now);
    await tx.grant.update({ where: { id: grant.id }, data: { sentAt: now } });
    return toSend(
      event,
      { ...grant, holderEmail: grant.holderEmail },
      now,
      grant.sentAt
    );
  }, LOCKED_TX);
}

/**
 * The email did not go out: hand back the day's quota and the previous
 * stamp, unless a later send has stamped it since.
 */
export async function releaseInvitationSend(
  prisma: PrismaClient,
  invitation: Pick<InvitationToSend, 'grantId' | 'sentAt' | 'previousSentAt'>
): Promise<void> {
  await prisma.grant.updateMany({
    where: { id: invitation.grantId, sentAt: invitation.sentAt },
    data: { sentAt: invitation.previousSentAt },
  });
}
