import { EmailStatus, Prisma } from '@troptix/db';
import type { Email, PrismaClient } from '@troptix/db';
import { EMAIL_TYPES, enqueueEmail } from './_shared/emails';

const RETRY_DELAY_MINUTES = [1, 5, 30, 120, 360];
export const MAX_EMAIL_ATTEMPTS = RETRY_DELAY_MINUTES.length + 1;
const CLAIM_BATCH = 20;
const STALE_CLAIM_MINUTES = 5;
// Resend's rate limit is per second, so a short pause usually clears it.
const RATE_LIMIT_PAUSE_MS = 1000;
const MAX_RATE_LIMIT_PAUSES = 2;

export type SendOutcome =
  | { ok: true; resendId: string }
  | {
      ok: false;
      reason:
        | 'rate_limited'
        | 'daily_quota'
        | 'monthly_quota'
        | 'in_progress'
        | 'error';
      message: string;
    };

export type EmailSender = (email: Email) => Promise<SendOutcome>;

export interface DispatchResult {
  sent: number;
  retrying: number;
  failed: Email[];
  quotaExceeded: 'daily_quota' | 'monthly_quota' | null;
}

const MINUTE = 60_000;

const PLATFORM_INBOX = 'info@usetroptix.com';

/** A chargeback notice for the Platform Owners; its builder reads Stripe. */
export function enqueueDisputeNotice(
  prisma: PrismaClient,
  disputeId: string
): Promise<void> {
  return enqueueEmail(prisma, {
    type: EMAIL_TYPES.disputeNotice,
    subjectId: disputeId,
    to: PLATFORM_INBOX,
    idempotencyKey: `dispute-${disputeId}`,
  });
}

function nextMidnightUtc(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
}

function firstOfNextMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Claims in one short statement and sends outside any transaction, so two
 * dispatchers never take the same row. A row left SENDING by a crashed run is
 * claimed again after a few minutes, as one more attempt; Resend's idempotency
 * key stops a resend.
 */
async function claimDueEmails(prisma: PrismaClient): Promise<Email[]> {
  // RETURNING keeps no order, so sort the claimed rows again.
  return prisma.$queryRaw<Email[]>(Prisma.sql`
    WITH claimed AS (
      UPDATE "Email" SET
        status = 'SENDING',
        "claimedAt" = now(),
        attempts = attempts + CASE WHEN status = 'SENDING' THEN 1 ELSE 0 END
      WHERE id IN (
        SELECT id FROM "Email"
        WHERE (status = 'PENDING' AND "nextAttemptAt" <= now())
           OR (status = 'SENDING' AND "claimedAt" < now() - make_interval(mins => ${STALE_CLAIM_MINUTES}))
        ORDER BY priority, "createdAt"
        LIMIT ${CLAIM_BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    )
    SELECT * FROM claimed ORDER BY priority, "createdAt"`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function release(prisma: PrismaClient, ids: string[], nextAttemptAt: Date) {
  return prisma.email.updateMany({
    where: { id: { in: ids }, status: EmailStatus.SENDING },
    data: { status: EmailStatus.PENDING, claimedAt: null, nextAttemptAt },
  });
}

/**
 * Records a failed attempt, or gives up after the last one. Returns null when
 * the row is no longer SENDING.
 */
async function recordFailure(
  prisma: PrismaClient,
  email: Email,
  attempts: number,
  lastError: string,
  now: Date
): Promise<Email | null> {
  const gaveUp = attempts >= MAX_EMAIL_ATTEMPTS;
  const data = {
    attempts,
    lastError,
    claimedAt: null,
    ...(gaveUp
      ? { status: EmailStatus.FAILED, statusAt: now }
      : {
          status: EmailStatus.PENDING,
          nextAttemptAt: new Date(
            now.getTime() + RETRY_DELAY_MINUTES[attempts - 1] * MINUTE
          ),
        }),
  };
  const { count } = await prisma.email.updateMany({
    where: { id: email.id, status: EmailStatus.SENDING },
    data,
  });
  return count ? { ...email, ...data } : null;
}

/**
 * Rate limits and quotas say "not now", not "this email is bad", so they
 * never count an attempt. A rate limit gets a short pause; a quota, or a rate
 * limit that outlasts the pauses, stops the run.
 */
export async function dispatchEmails(
  prisma: PrismaClient,
  send: EmailSender
): Promise<DispatchResult> {
  const claimed = await claimDueEmails(prisma);
  const result: DispatchResult = {
    sent: 0,
    retrying: 0,
    failed: [],
    quotaExceeded: null,
  };
  let rateLimitPauses = 0;

  for (let index = 0; index < claimed.length; index++) {
    const email = claimed[index];

    if (email.attempts >= MAX_EMAIL_ATTEMPTS) {
      const failed = await recordFailure(
        prisma,
        email,
        email.attempts,
        email.lastError ?? 'Send never finished',
        new Date()
      );
      if (failed) result.failed.push(failed);
      continue;
    }

    const outcome = await send(email).catch(
      (error): SendOutcome => ({
        ok: false,
        reason: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    );
    const now = new Date();

    if (outcome.ok) {
      // Resend's webhook can land first and move the row past SENT.
      await prisma.email.updateMany({
        where: { id: email.id, status: EmailStatus.SENDING },
        data: {
          status: EmailStatus.SENT,
          resendId: outcome.resendId,
          sentAt: now,
          statusAt: now,
          claimedAt: null,
          lastError: null,
        },
      });
      result.sent++;
      continue;
    }

    if (outcome.reason === 'in_progress') {
      await release(prisma, [email.id], new Date(now.getTime() + MINUTE));
      result.retrying++;
      continue;
    }

    if (
      outcome.reason === 'rate_limited' &&
      rateLimitPauses < MAX_RATE_LIMIT_PAUSES
    ) {
      rateLimitPauses++;
      await sleep(RATE_LIMIT_PAUSE_MS);
      index--;
      continue;
    }

    if (outcome.reason !== 'error') {
      const waitUntil =
        outcome.reason === 'rate_limited'
          ? new Date(now.getTime() + MINUTE)
          : outcome.reason === 'daily_quota'
            ? nextMidnightUtc(now)
            : firstOfNextMonthUtc(now);
      const unsent = claimed.slice(index).map((e) => e.id);
      await release(prisma, unsent, waitUntil);
      result.retrying += unsent.length;
      if (outcome.reason !== 'rate_limited') {
        result.quotaExceeded = outcome.reason;
      }
      break;
    }

    const updated = await recordFailure(
      prisma,
      email,
      email.attempts + 1,
      outcome.message,
      now
    );
    if (updated?.status === EmailStatus.FAILED) result.failed.push(updated);
    else if (updated) result.retrying++;
  }

  return result;
}

const DELIVERY_STATUS: Record<string, EmailStatus> = {
  'email.delivery_delayed': EmailStatus.DELAYED,
  'email.delivered': EmailStatus.DELIVERED,
  'email.bounced': EmailStatus.BOUNCED,
  'email.suppressed': EmailStatus.SUPPRESSED,
  'email.failed': EmailStatus.FAILED,
  'email.complained': EmailStatus.COMPLAINED,
};

const STATUS_RANK: Record<EmailStatus, number> = {
  PENDING: 0,
  SENDING: 1,
  SENT: 2,
  DELAYED: 3,
  DELIVERED: 4,
  BOUNCED: 5,
  SUPPRESSED: 5,
  FAILED: 5,
  COMPLAINED: 6,
};

const ALL_STATUSES = Object.keys(STATUS_RANK) as EmailStatus[];
const LOWER_STATUSES = Object.fromEntries(
  ALL_STATUSES.map((status) => [
    status,
    ALL_STATUSES.filter((s) => STATUS_RANK[s] < STATUS_RANK[status]),
  ])
) as Record<EmailStatus, EmailStatus[]>;

export const UNDELIVERED_STATUSES: EmailStatus[] = [
  EmailStatus.BOUNCED,
  EmailStatus.SUPPRESSED,
  EmailStatus.FAILED,
  EmailStatus.COMPLAINED,
];

export interface DeliveryEvent {
  type: string;
  resendId: string;
  /** Our `Email.id`, from the tag every send carries. */
  emailId?: string;
  at: Date;
}

/**
 * Resend's events can arrive late, twice or out of order, so a status only
 * moves up the rank: a late "delayed" never undoes "delivered". The one
 * exception is a row we gave up on before Resend ever confirmed it (FAILED,
 * no `sentAt`): any Resend event about it is newer news. Returns the row when
 * this event changed it.
 */
export async function recordDeliveryEvent(
  prisma: PrismaClient,
  event: DeliveryEvent
): Promise<Email | null> {
  const status = DELIVERY_STATUS[event.type];
  if (!status) return null;

  const match: Prisma.EmailWhereInput = event.emailId
    ? { OR: [{ resendId: event.resendId }, { id: event.emailId }] }
    : { resendId: event.resendId };
  const { count } = await prisma.email.updateMany({
    where: {
      AND: [
        match,
        {
          OR: [
            { status: { in: LOWER_STATUSES[status] } },
            ...(status === EmailStatus.FAILED
              ? []
              : [{ status: EmailStatus.FAILED, sentAt: null }]),
          ],
        },
      ],
    },
    data: {
      status,
      statusAt: event.at,
      resendId: event.resendId,
      claimedAt: null,
    },
  });
  return count ? prisma.email.findFirst({ where: match }) : null;
}
