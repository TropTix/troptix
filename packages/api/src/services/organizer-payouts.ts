import type { PrismaClient, Prisma } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type {
  CancelPayoutRequestInput,
  GetPayoutsInput,
  OrganizerPayoutRequest,
  OrganizerPayouts,
  RequestPayoutInput,
} from '../contracts/payouts';
import {
  InvalidPayoutAmountError,
  NotFoundError,
  PayoutRequestPendingError,
  PayoutSetupIncompleteError,
  UnauthorizedError,
} from './_shared/errors';
import { calculateFeesCents } from './_shared/fees';
import { toCents } from './_shared/organizerMapping';
import {
  releaseEarnings,
  resolvePayoutPolicy,
  type PayoutPolicy,
} from './_shared/payouts';
import { resolveOrganizerScope } from './organizer-scope';

type Db = PrismaClient | Prisma.TransactionClient;

const ORG_PAYOUT_SELECT = {
  id: true,
  payoutMeetingAt: true,
  payoutBankLinkedAt: true,
  payoutReleaseAtSale: true,
  payoutHoldbackPercent: true,
  payoutHoldbackDays: true,
} as const;

type OrgPayoutRow = Prisma.OrganizationGetPayload<{
  select: typeof ORG_PAYOUT_SELECT;
}>;

interface EarnedRow {
  eventId: string;
  endsAt: Date;
  subtotalCents: bigint;
}

interface AbsorbedGroupRow {
  eventId: string;
  subtotal: number | null;
  quantity: bigint;
}

interface Balances {
  releasedCents: number;
  availableCents: number;
  pendingCents: number;
  paidOutCents: number;
}

/**
 * The ledger read (ADR 0028). Absorbed fees are derived here, not stored:
 * checkout writes fees = 0 on a priced ticket exactly when the type absorbed
 * them, so a ticket's own stored (subtotal, fees) pair says which mode it
 * sold under. Classifying from the immutable ticket row — never the type's
 * current ticketingFees — means later fee-mode edits, price edits, and type
 * deletion cannot rewrite history.
 */
async function computeBalances(
  db: Db,
  organizationId: string,
  policy: PayoutPolicy,
  now: Date
): Promise<Balances> {
  const [earnedRows, absorbedGroups, requestSums] = await Promise.all([
    db.$queryRaw<EarnedRow[]>`
      SELECT e."id" AS "eventId",
             e."endsAt" AS "endsAt",
             SUM(COALESCE(o."subtotalCents", ROUND(o."subtotal" * 100)::int, 0))::bigint AS "subtotalCents"
      FROM "Orders" o
      JOIN "Events" e ON e."id" = o."eventId"
      WHERE o."status" = 'COMPLETED'
        AND e."organizationId" = ${organizationId}
        AND e."deletedAt" IS NULL
      GROUP BY e."id", e."endsAt"
    `,

    // fees = 0 on a priced ticket ⇔ sold under ABSORB_TICKET_FEES (a passed
    // fee is never 0 when subtotal > 0, and free tickets absorb nothing).
    db.$queryRaw<AbsorbedGroupRow[]>`
      SELECT t."eventId" AS "eventId",
             t."subtotal" AS "subtotal",
             COUNT(*)::bigint AS "quantity"
      FROM "Tickets" t
      JOIN "Orders" o ON o."id" = t."orderId"
      JOIN "Events" e ON e."id" = t."eventId"
      WHERE o."status" = 'COMPLETED'
        AND e."organizationId" = ${organizationId}
        AND e."deletedAt" IS NULL
        AND COALESCE(t."fees", 0) = 0
        AND t."subtotal" > 0
      GROUP BY t."eventId", t."subtotal"
    `,

    db.payoutRequest.groupBy({
      by: ['status'],
      where: { organizationId },
      _sum: { amountCents: true },
    }),
  ]);

  const absorbedByEvent = new Map<string, number>();
  for (const group of absorbedGroups) {
    const fee = calculateFeesCents(toCents(group.subtotal));
    const prior = absorbedByEvent.get(group.eventId) ?? 0;
    absorbedByEvent.set(group.eventId, prior + fee * Number(group.quantity));
  }

  let releasedCents = 0;
  let pendingCents = 0;
  for (const row of earnedRows) {
    const earned =
      Number(row.subtotalCents) - (absorbedByEvent.get(row.eventId) ?? 0);
    const split = releaseEarnings(earned, row.endsAt, policy, now);
    releasedCents += split.releasedCents;
    pendingCents += split.pendingCents;
  }

  const sumFor = (status: 'REQUESTED' | 'PAID') =>
    requestSums.find((row) => row.status === status)?._sum.amountCents ?? 0;
  const paidOutCents = sumFor('PAID');

  return {
    releasedCents,
    availableCents: releasedCents - sumFor('REQUESTED') - paidOutCents,
    pendingCents,
    paidOutCents,
  };
}

function toSetupState(org: OrgPayoutRow) {
  const meetingDone = org.payoutMeetingAt !== null;
  const bankLinked = org.payoutBankLinkedAt !== null;
  return { meetingDone, bankLinked, complete: meetingDone && bankLinked };
}

export function toRequestDto(request: {
  id: string;
  createdAt: Date;
  status: OrganizerPayoutRequest['status'];
  amountCents: number;
  note: string | null;
  resolvedAt: Date | null;
  rail: OrganizerPayoutRequest['rail'];
  reference: string | null;
  adminNote: string | null;
}): OrganizerPayoutRequest {
  return {
    id: request.id,
    createdAt: request.createdAt.toISOString(),
    status: request.status,
    amountCents: request.amountCents,
    note: request.note,
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
    rail: request.rail,
    reference: request.reference,
    adminNote: request.adminNote,
  };
}

export async function getPayouts(
  prisma: PrismaClient,
  actor: Actor,
  input: GetPayoutsInput = {},
  now: Date = new Date()
): Promise<OrganizerPayouts> {
  const organizerUserId = await resolveOrganizerScope(
    prisma,
    actor,
    input.viewAsOrganizerUserId
  );

  const org = await prisma.organization.findFirst({
    where: { ownerUserId: organizerUserId },
    select: ORG_PAYOUT_SELECT,
  });

  if (!org) {
    return {
      availableCents: 0,
      pendingCents: 0,
      paidOutCents: 0,
      setup: { meetingDone: false, bankLinked: false, complete: false },
      policy: resolvePayoutPolicy({
        payoutReleaseAtSale: false,
        payoutHoldbackPercent: null,
        payoutHoldbackDays: null,
      }),
      requests: [],
    };
  }

  const policy = resolvePayoutPolicy(org);
  const [balances, requests] = await Promise.all([
    computeBalances(prisma, org.id, policy, now),
    prisma.payoutRequest.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    availableCents: balances.availableCents,
    pendingCents: balances.pendingCents,
    paidOutCents: balances.paidOutCents,
    setup: toSetupState(org),
    policy,
    requests: requests.map(toRequestDto),
  };
}

/**
 * Owner-only (Owner = "members and money"); never accepts a View-as target.
 * Availability is recomputed inside a Serializable transaction so two
 * concurrent asks can't both pass the one-open-request check.
 */
export async function requestPayout(
  prisma: PrismaClient,
  actor: Actor,
  input: RequestPayoutInput,
  now: Date = new Date()
): Promise<OrganizerPayoutRequest> {
  if (actor.kind !== 'user') {
    throw new UnauthorizedError('Sign in to request a payout');
  }

  const created = await prisma.$transaction(
    async (tx) => {
      const org = await tx.organization.findFirst({
        where: { ownerUserId: actor.userId },
        select: ORG_PAYOUT_SELECT,
      });
      if (!org) {
        throw new NotFoundError('No organization for this user');
      }
      if (!toSetupState(org).complete) {
        throw new PayoutSetupIncompleteError();
      }

      const open = await tx.payoutRequest.count({
        where: { organizationId: org.id, status: 'REQUESTED' },
      });
      if (open > 0) {
        throw new PayoutRequestPendingError();
      }

      const balances = await computeBalances(
        tx,
        org.id,
        resolvePayoutPolicy(org),
        now
      );
      if (
        input.amountCents <= 0 ||
        input.amountCents > balances.availableCents
      ) {
        throw new InvalidPayoutAmountError(
          'Requested amount exceeds the available balance'
        );
      }

      return tx.payoutRequest.create({
        data: {
          organizationId: org.id,
          requestedByUserId: actor.userId,
          amountCents: input.amountCents,
          note: input.note?.trim() || null,
        },
      });
    },
    { isolationLevel: 'Serializable' }
  );

  return toRequestDto(created);
}

export async function cancelPayoutRequest(
  prisma: PrismaClient,
  actor: Actor,
  input: CancelPayoutRequestInput
): Promise<void> {
  if (actor.kind !== 'user') {
    throw new UnauthorizedError('Sign in to cancel a payout request');
  }

  const updated = await prisma.payoutRequest.updateMany({
    where: {
      id: input.id,
      status: 'REQUESTED',
      organization: { ownerUserId: actor.userId },
    },
    data: { status: 'CANCELLED' },
  });

  if (updated.count === 0) {
    throw new NotFoundError('No open payout request to cancel');
  }
}
