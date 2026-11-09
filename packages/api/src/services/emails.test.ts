// Real Postgres: the claim is a row-locking statement, which a mock can't check.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import prisma, { EmailStatus } from '@troptix/db';
import type { Email } from '@troptix/db';
import { generateId } from './_shared/ids';
import {
  dispatchEmails,
  MAX_EMAIL_ATTEMPTS,
  type EmailSender,
  type SendOutcome,
} from './emails';

const MINUTE = 60_000;

// The dispatcher sends every due row in the table, so each test owns it.
beforeEach(async () => {
  await prisma.email.deleteMany({});
});

afterAll(async () => {
  await prisma.email.deleteMany({});
  await prisma.$disconnect();
});

function makeEmail(overrides: Partial<Email> = {}) {
  const id = generateId();
  return prisma.email.create({
    data: {
      type: 'order_confirmation',
      subjectId: `ord-${id}`,
      to: `${id}@troptix.test`,
      idempotencyKey: `confirmation-${id}`,
      ...overrides,
    },
  });
}

function sender(outcome: SendOutcome | ((email: Email) => SendOutcome)) {
  const sent: Email[] = [];
  const send: EmailSender = async (email) => {
    sent.push(email);
    return typeof outcome === 'function' ? outcome(email) : outcome;
  };
  return { send, sent };
}

const accepted = (email: Email): SendOutcome => ({
  ok: true,
  resendId: `re_${email.id}`,
});

function reload(id: string) {
  return prisma.email.findUniqueOrThrow({ where: { id } });
}

describe('dispatchEmails', () => {
  it('sends a due email and records the Resend id', async () => {
    const email = await makeEmail();
    const { send, sent } = sender(accepted);

    const result = await dispatchEmails(prisma, send);

    expect(result.sent).toBe(1);
    expect(sent.map((e) => e.id)).toEqual([email.id]);
    const after = await reload(email.id);
    expect(after.status).toBe(EmailStatus.SENT);
    expect(after.resendId).toBe(`re_${email.id}`);
    expect(after.sentAt).not.toBeNull();
    expect(after.claimedAt).toBeNull();
  });

  it('leaves an email that is not yet due', async () => {
    const email = await makeEmail({
      nextAttemptAt: new Date(Date.now() + MINUTE),
    });
    const { send, sent } = sender(accepted);

    await dispatchEmails(prisma, send);

    expect(sent).toHaveLength(0);
    expect((await reload(email.id)).status).toBe(EmailStatus.PENDING);
  });

  it('backs off after an error and gives up after the last attempt', async () => {
    const email = await makeEmail();
    const { send } = sender({ ok: false, reason: 'error', message: 'boom' });

    const before = Date.now();
    await dispatchEmails(prisma, send);
    const retry = await reload(email.id);
    expect(retry.status).toBe(EmailStatus.PENDING);
    expect(retry.attempts).toBe(1);
    expect(retry.lastError).toBe('boom');
    expect(retry.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(
      before + MINUTE
    );

    await prisma.email.update({
      where: { id: email.id },
      data: { attempts: MAX_EMAIL_ATTEMPTS - 1, nextAttemptAt: new Date() },
    });
    const result = await dispatchEmails(prisma, send);

    expect(result.failed.map((e) => e.id)).toEqual([email.id]);
    const failed = await reload(email.id);
    expect(failed.status).toBe(EmailStatus.FAILED);
    expect(failed.attempts).toBe(MAX_EMAIL_ATTEMPTS);
  });

  it('treats a sender that throws as an error', async () => {
    const email = await makeEmail();
    const send: EmailSender = async () => {
      throw new Error('Order missing');
    };

    await dispatchEmails(prisma, send);

    const after = await reload(email.id);
    expect(after.attempts).toBe(1);
    expect(after.lastError).toBe('Order missing');
  });

  it('pauses on a rate limit and carries on', async () => {
    const first = await makeEmail();
    const second = await makeEmail();
    let limited = false;
    const { send, sent } = sender((email) => {
      if (limited) return accepted(email);
      limited = true;
      return { ok: false, reason: 'rate_limited', message: 'slow down' };
    });

    const result = await dispatchEmails(prisma, send);

    expect(sent.map((e) => e.id)).toEqual([first.id, first.id, second.id]);
    expect(result.sent).toBe(2);
    expect((await reload(first.id)).attempts).toBe(0);
  });

  it('stops the run when the rate limit outlasts the pauses', async () => {
    const first = await makeEmail();
    const second = await makeEmail();
    const { send, sent } = sender({
      ok: false,
      reason: 'rate_limited',
      message: 'slow down',
    });

    const result = await dispatchEmails(prisma, send);

    expect(sent.map((e) => e.id)).toEqual([first.id, first.id, first.id]);
    expect(result.retrying).toBe(2);
    for (const id of [first.id, second.id]) {
      const after = await reload(id);
      expect(after.status).toBe(EmailStatus.PENDING);
      expect(after.attempts).toBe(0);
    }
  });

  it('waits for midnight UTC when the daily quota is used up', async () => {
    const email = await makeEmail();
    const { send } = sender({
      ok: false,
      reason: 'daily_quota',
      message: 'quota',
    });

    const result = await dispatchEmails(prisma, send);

    expect(result.quotaExceeded).toBe('daily_quota');
    const after = await reload(email.id);
    expect(after.attempts).toBe(0);
    const now = new Date();
    expect(after.nextAttemptAt).toEqual(
      new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
      )
    );
  });

  it('sends lower priority numbers first', async () => {
    const bulk = await makeEmail({ priority: 1 });
    const receipt = await makeEmail({ priority: 0 });
    const { send, sent } = sender(accepted);

    await dispatchEmails(prisma, send);

    expect(sent.map((e) => e.id)).toEqual([receipt.id, bulk.id]);
  });

  it('never gives one email to two dispatchers', async () => {
    const emails = await Promise.all(
      Array.from({ length: 10 }, () => makeEmail())
    );
    const { send, sent } = sender(accepted);

    await Promise.all([
      dispatchEmails(prisma, send),
      dispatchEmails(prisma, send),
    ]);

    expect(sent.map((e) => e.id).sort()).toEqual(
      emails.map((e) => e.id).sort()
    );
  });

  it('claims again an email left sending by a crashed run', async () => {
    const stale = await makeEmail({
      status: EmailStatus.SENDING,
      claimedAt: new Date(Date.now() - 6 * MINUTE),
    });
    const fresh = await makeEmail({
      status: EmailStatus.SENDING,
      claimedAt: new Date(),
    });
    const { send, sent } = sender(accepted);

    await dispatchEmails(prisma, send);

    expect(sent.map((e) => e.id)).toEqual([stale.id]);
    expect((await reload(stale.id)).attempts).toBe(1);
    expect((await reload(fresh.id)).status).toBe(EmailStatus.SENDING);
  });

  it('gives up on an email whose sends never finish', async () => {
    const stuck = await makeEmail({
      status: EmailStatus.SENDING,
      attempts: MAX_EMAIL_ATTEMPTS - 1,
      claimedAt: new Date(Date.now() - 6 * MINUTE),
    });
    const { send, sent } = sender(accepted);

    const result = await dispatchEmails(prisma, send);

    expect(sent).toHaveLength(0);
    expect(result.failed.map((e) => e.id)).toEqual([stuck.id]);
    const after = await reload(stuck.id);
    expect(after.status).toBe(EmailStatus.FAILED);
    expect(after.lastError).toBe('Send never finished');
  });
});
