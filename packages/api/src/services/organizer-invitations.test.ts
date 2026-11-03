// Real Postgres via POSTGRES_PRISMA_URL (see reservations.test.ts) — point it
// at a preview/dev branch, never prod.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import prisma from '@troptix/db';
import type { Actor } from '../trpc/context';
import { generateId } from './_shared/ids';
import {
  ConflictError,
  InvitationLimitError,
  InvitationsNotAllowedError,
  NotFoundError,
} from './_shared/errors';
import {
  inviteGuests,
  releaseInvitationSend,
  resendInvitation,
} from './organizer-invitations';

const OWNER_ID = `test-inv-owner-${generateId()}`;
const OWNER: Actor = { kind: 'user', userId: OWNER_ID, role: 'PATRON' };
const ORG_ID = `test-inv-org-${generateId()}`;
const EVENT_ID = `test-inv-evt-${generateId()}`;
const SISTER_EVENT_ID = `test-inv-evt2-${generateId()}`;
const DAY = 86_400_000;
let seat: string;

beforeAll(async () => {
  await prisma.users.create({
    data: { id: OWNER_ID, email: `${OWNER_ID.toLowerCase()}@troptix.test` },
  });
  await prisma.organization.create({
    data: {
      id: ORG_ID,
      slug: ORG_ID,
      displayName: 'Hearts Foundation',
      ownerUserId: OWNER_ID,
    },
  });
  for (const id of [EVENT_ID, SISTER_EVENT_ID]) {
    await prisma.events.create({
      data: {
        id,
        isDraft: false,
        name: 'Legends Gala',
        description: 'Fixture for organizer-invitations.test.ts',
        organizer: 'Hearts Foundation',
        organizerUserId: OWNER_ID,
        organizationId: ORG_ID,
        startsAt: new Date(Date.now() + 30 * DAY),
        endsAt: new Date(Date.now() + 31 * DAY),
        address: '1 Gala Way',
      },
    });
  }
  seat = (
    await prisma.ticketTypes.create({
      data: {
        id: generateId(),
        name: 'Gala seat',
        description: '',
        maxPurchasePerUser: 4,
        capacity: 100,
        price: 0,
        priceCents: 0,
        hidden: true,
        saleStartsAt: new Date(Date.now() - DAY),
        saleEndsAt: new Date(Date.now() + 29 * DAY),
        eventId: EVENT_ID,
      },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.grant.deleteMany({
    where: { eventId: { in: [EVENT_ID, SISTER_EVENT_ID] } },
  });
  await setGate({ verified: false, paidTicketingEnabled: true });
});

afterAll(async () => {
  await prisma.grant.deleteMany({
    where: { eventId: { in: [EVENT_ID, SISTER_EVENT_ID] } },
  });
  await prisma.ticketTypes.deleteMany({
    where: { eventId: { in: [EVENT_ID, SISTER_EVENT_ID] } },
  });
  await prisma.events.deleteMany({
    where: { id: { in: [EVENT_ID, SISTER_EVENT_ID] } },
  });
  await prisma.organization.delete({ where: { id: ORG_ID } });
  await prisma.users.delete({ where: { id: OWNER_ID } });
  await prisma.$disconnect();
});

function setGate(gate: { verified: boolean; paidTicketingEnabled: boolean }) {
  return prisma.organization.update({ where: { id: ORG_ID }, data: gate });
}

const batch = (emails: string[], send = true) => ({
  emails,
  ticketTypeIds: [seat],
  expiresAt: new Date(Date.now() + 5 * DAY),
  send,
});

/** Fills the organization's last 24 hours with already-sent invitations. */
async function alreadySent(count: number) {
  const now = Date.now();
  await prisma.grant.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      id: generateId(),
      eventId: SISTER_EVENT_ID,
      code: `SENT${i}`,
      holderEmail: `sent${i}@example.com`,
      sentAt: new Date(now - 60_000),
    })),
  });
}

describe('inviteGuests', () => {
  it('creates one one-use grant per address and returns what to send', async () => {
    const res = await inviteGuests(
      prisma,
      OWNER,
      EVENT_ID,
      batch([' Ana@Example.com', 'ben@example.com', 'ana@example.com'])
    );

    expect(res.created.map((c) => c.email)).toEqual([
      'ana@example.com',
      'ben@example.com',
    ]);
    expect(res.skipped).toEqual([
      { email: 'ana@example.com', reason: 'duplicate' },
    ]);
    expect(res.toSend).toHaveLength(2);
    expect(res.toSend[0]).toMatchObject({
      to: 'ana@example.com',
      replyTo: `${OWNER_ID.toLowerCase()}@troptix.test`,
      invite: {
        eventId: EVENT_ID,
        eventName: 'Legends Gala',
        organizationName: 'Hearts Foundation',
        quantity: 1,
        code: res.created[0].code,
      },
    });

    const rows = await prisma.grant.findMany({
      where: { eventId: EVENT_ID },
      include: { ticketTypes: true },
    });
    for (const row of rows) {
      expect(row).toMatchObject({ maxUses: 1, quantity: 1, usedCount: 0 });
      expect(row.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect(row.sentAt).not.toBeNull();
      expect(row.ticketTypes.map((t) => t.ticketTypeId)).toEqual([seat]);
    }
  });

  it('skips an address that already holds a working invitation', async () => {
    await inviteGuests(prisma, OWNER, EVENT_ID, batch(['ana@example.com']));
    const again = await inviteGuests(
      prisma,
      OWNER,
      EVENT_ID,
      batch(['ana@example.com', 'cy@example.com'])
    );
    expect(again.skipped).toEqual([
      { email: 'ana@example.com', reason: 'alreadyInvited' },
    ]);
    expect(again.created.map((c) => c.email)).toEqual(['cy@example.com']);
  });

  it('re-invites an address whose invitation is used up, since it cannot be resent', async () => {
    const first = await inviteGuests(
      prisma,
      OWNER,
      EVENT_ID,
      batch(['ana@example.com'])
    );
    await prisma.grant.update({
      where: { id: first.created[0].grantId },
      data: { usedCount: 1 },
    });
    const again = await inviteGuests(
      prisma,
      OWNER,
      EVENT_ID,
      batch(['ana@example.com'])
    );
    expect(again.created).toHaveLength(1);
  });

  it('re-invites an address whose invitation was revoked', async () => {
    const first = await inviteGuests(
      prisma,
      OWNER,
      EVENT_ID,
      batch(['ana@example.com'])
    );
    await prisma.grant.update({
      where: { id: first.created[0].grantId },
      data: { revokedAt: new Date() },
    });
    const again = await inviteGuests(
      prisma,
      OWNER,
      EVENT_ID,
      batch(['ana@example.com'])
    );
    expect(again.created).toHaveLength(1);
  });

  it('refuses to send for an organization neither verified nor approved, but still creates', async () => {
    await setGate({ verified: false, paidTicketingEnabled: false });
    await expect(
      inviteGuests(prisma, OWNER, EVENT_ID, batch(['ana@example.com']))
    ).rejects.toThrow(InvitationsNotAllowedError);
    expect(await prisma.grant.count({ where: { eventId: EVENT_ID } })).toBe(0);

    const quiet = await inviteGuests(
      prisma,
      OWNER,
      EVENT_ID,
      batch(['ana@example.com'], false)
    );
    expect(quiet.toSend).toEqual([]);
    expect(
      (await prisma.grant.findFirstOrThrow({ where: { eventId: EVENT_ID } }))
        .sentAt
    ).toBeNull();

    await setGate({ verified: true, paidTicketingEnabled: false });
    await expect(
      inviteGuests(prisma, OWNER, EVENT_ID, batch(['ben@example.com']))
    ).resolves.toBeDefined();
  });

  it('refuses a batch over the daily cap whole, counting every event of the organization', async () => {
    await alreadySent(499);
    const err = await inviteGuests(
      prisma,
      OWNER,
      EVENT_ID,
      batch(['ana@example.com', 'ben@example.com'])
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvitationLimitError);
    expect((err as InvitationLimitError).remaining).toBe(1);
    expect(await prisma.grant.count({ where: { eventId: EVENT_ID } })).toBe(0);
  });

  it('lets only one of two racing batches through the cap', async () => {
    await alreadySent(495);
    const results = await Promise.allSettled([
      inviteGuests(
        prisma,
        OWNER,
        EVENT_ID,
        batch(['a1@example.com', 'a2@example.com', 'a3@example.com'])
      ),
      inviteGuests(
        prisma,
        OWNER,
        EVENT_ID,
        batch(['b1@example.com', 'b2@example.com', 'b3@example.com'])
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.grant.count({ where: { eventId: EVENT_ID } })).toBe(3);
  });

  it('refuses a ticket type from another event', async () => {
    const elsewhere = await prisma.ticketTypes.create({
      data: {
        id: generateId(),
        name: 'Other',
        description: '',
        maxPurchasePerUser: 4,
        capacity: 10,
        price: 0,
        saleStartsAt: new Date(),
        saleEndsAt: new Date(Date.now() + DAY),
        eventId: SISTER_EVENT_ID,
      },
    });
    await expect(
      inviteGuests(prisma, OWNER, EVENT_ID, {
        ...batch(['ana@example.com']),
        ticketTypeIds: [elsewhere.id],
      })
    ).rejects.toThrow(NotFoundError);
  });
});

const inTwoDays = () => new Date(Date.now() + 2 * DAY);

describe('resendInvitation and releaseInvitationSend', () => {
  it('restamps an active invitation, and a failed send hands the stamp back', async () => {
    const { created } = await inviteGuests(
      prisma,
      OWNER,
      EVENT_ID,
      batch(['ana@example.com'])
    );
    const grantId = created[0].grantId;
    const first = (
      await prisma.grant.findUniqueOrThrow({ where: { id: grantId } })
    ).sentAt;

    const later = new Date(Date.now() + DAY + 60_000);
    const resend = await resendInvitation(
      prisma,
      OWNER,
      EVENT_ID,
      grantId,
      later
    );
    expect(resend).toMatchObject({
      to: 'ana@example.com',
      sentAt: later,
      previousSentAt: first,
      invite: { code: created[0].code },
    });

    await releaseInvitationSend(prisma, resend);
    expect(
      (await prisma.grant.findUniqueOrThrow({ where: { id: grantId } })).sentAt
    ).toEqual(first);
  });

  it('refuses a used-up invitation until the organizer extends it', async () => {
    const { created } = await inviteGuests(
      prisma,
      OWNER,
      EVENT_ID,
      batch(['ana@example.com'])
    );
    const grantId = created[0].grantId;
    await prisma.grant.update({
      where: { id: grantId },
      data: { usedCount: 1 },
    });
    await expect(
      resendInvitation(prisma, OWNER, EVENT_ID, grantId)
    ).rejects.toThrow(ConflictError);

    await prisma.grant.update({ where: { id: grantId }, data: { maxUses: 2 } });
    await expect(
      resendInvitation(prisma, OWNER, EVENT_ID, grantId, inTwoDays())
    ).resolves.toMatchObject({ grantId });
  });

  it('resends a grant at most once a day, so resends stay inside the cap', async () => {
    const { created } = await inviteGuests(
      prisma,
      OWNER,
      EVENT_ID,
      batch(['ana@example.com'])
    );
    await expect(
      resendInvitation(prisma, OWNER, EVENT_ID, created[0].grantId)
    ).rejects.toThrow(/less than a day ago/);
  });

  it('does not resend a code that has no holder', async () => {
    const plain = await prisma.grant.create({
      data: { id: generateId(), eventId: EVENT_ID, code: 'PLAIN' },
    });
    await expect(
      resendInvitation(prisma, OWNER, EVENT_ID, plain.id)
    ).rejects.toThrow(NotFoundError);
  });
});
