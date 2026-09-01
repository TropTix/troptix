import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import type {
  PayoutOrganization,
  PlatformPayoutRequest,
  ResolvePayoutRequestInput,
  SetPayoutPolicyInput,
  SetPayoutSetupStepInput,
} from '../contracts/payouts';
import { ConflictError, NotFoundError } from './_shared/errors';
import { resolvePayoutPolicy } from './_shared/payouts';
import { toRequestDto } from './organizer-payouts';
import { requirePlatformOwner } from './organizer-scope';

export async function listPayoutRequests(
  prisma: PrismaClient,
  actor: Actor
): Promise<PlatformPayoutRequest[]> {
  await requirePlatformOwner(prisma, actor);

  const rows = await prisma.payoutRequest.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      organization: {
        select: {
          displayName: true,
          slug: true,
          owner: { select: { email: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    ...toRequestDto(row),
    organizationId: row.organizationId,
    organizationName: row.organization.displayName,
    organizationSlug: row.organization.slug,
    ownerEmail: row.organization.owner.email,
  }));
}

/**
 * Guarded on `status: REQUESTED` so a double click, or an organizer cancel
 * racing the admin, resolves exactly once.
 */
export async function resolvePayoutRequest(
  prisma: PrismaClient,
  actor: Actor,
  input: ResolvePayoutRequestInput
): Promise<void> {
  const resolvedByUserId = await requirePlatformOwner(prisma, actor);

  if (input.outcome === 'REJECTED' && !input.adminNote?.trim()) {
    throw new ConflictError('A rejection needs a note for the organizer');
  }

  const updated = await prisma.payoutRequest.updateMany({
    where: { id: input.id, status: 'REQUESTED' },
    data: {
      status: input.outcome,
      resolvedAt: new Date(),
      resolvedByUserId,
      adminNote: input.adminNote?.trim() || null,
      ...(input.outcome === 'PAID'
        ? {
            rail: input.rail ?? 'MERCURY',
            reference: input.reference?.trim() || null,
          }
        : {}),
    },
  });

  if (updated.count === 0) {
    throw new ConflictError('This request was already resolved or cancelled');
  }
}

export async function setPayoutSetupStep(
  prisma: PrismaClient,
  actor: Actor,
  input: SetPayoutSetupStepInput
): Promise<void> {
  await requirePlatformOwner(prisma, actor);

  const column =
    input.step === 'meeting' ? 'payoutMeetingAt' : 'payoutBankLinkedAt';
  const updated = await prisma.organization.updateMany({
    where: { id: input.organizationId },
    data: { [column]: input.done ? new Date() : null },
  });

  if (updated.count === 0) {
    throw new NotFoundError('Organization not found');
  }
}

/** Custom payout timelines (graduated trust). Null resets to the platform default. */
export async function setPayoutPolicy(
  prisma: PrismaClient,
  actor: Actor,
  input: SetPayoutPolicyInput
): Promise<void> {
  await requirePlatformOwner(prisma, actor);

  const updated = await prisma.organization.updateMany({
    where: { id: input.organizationId },
    data: {
      payoutReleaseAtSale: input.releaseAtSale,
      payoutHoldbackPercent: input.holdbackPercent,
      payoutHoldbackDays: input.holdbackDays,
    },
  });

  if (updated.count === 0) {
    throw new NotFoundError('Organization not found');
  }
}

/** The setup panel's list: every Organization that sells (or has sold) paid tickets. */
export async function listPayoutOrganizations(
  prisma: PrismaClient,
  actor: Actor
): Promise<PayoutOrganization[]> {
  await requirePlatformOwner(prisma, actor);

  const rows = await prisma.organization.findMany({
    where: {
      OR: [
        { paidTicketingEnabled: true },
        {
          events: {
            some: { orders: { some: { status: 'COMPLETED', type: 'PAID' } } },
          },
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      displayName: true,
      slug: true,
      payoutMeetingAt: true,
      payoutBankLinkedAt: true,
      payoutReleaseAtSale: true,
      payoutHoldbackPercent: true,
      payoutHoldbackDays: true,
      owner: { select: { email: true } },
    },
  });

  return rows.map((org) => {
    const meetingDone = org.payoutMeetingAt !== null;
    const bankLinked = org.payoutBankLinkedAt !== null;
    return {
      id: org.id,
      displayName: org.displayName,
      slug: org.slug,
      ownerEmail: org.owner.email,
      payoutMeetingAt: org.payoutMeetingAt?.toISOString() ?? null,
      payoutBankLinkedAt: org.payoutBankLinkedAt?.toISOString() ?? null,
      setup: { meetingDone, bankLinked, complete: meetingDone && bankLinked },
      policy: resolvePayoutPolicy(org),
      holdbackPercentOverride: org.payoutHoldbackPercent,
      holdbackDaysOverride: org.payoutHoldbackDays,
      hasCustomPolicy:
        org.payoutReleaseAtSale ||
        org.payoutHoldbackPercent !== null ||
        org.payoutHoldbackDays !== null,
    };
  });
}
