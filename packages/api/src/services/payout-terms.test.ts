import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { PAYOUT_TERMS } from '../legal/payoutTerms';
import {
  acceptPayoutTerms,
  currentPayoutTerms,
  termsAccepted,
} from './payout-terms';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from './_shared/errors';

const OWNER: Actor = { kind: 'user', userId: 'owner-1', role: 'PATRON' };
const NOW = new Date('2026-09-27T12:00:00Z');

function fakePrisma(count = 1) {
  const updateMany = vi.fn().mockResolvedValue({ count });
  const prisma = { organization: { updateMany } } as unknown as PrismaClient;
  return { prisma, updateMany };
}

describe('payout terms', () => {
  it('serves the current version with its sections', () => {
    const terms = currentPayoutTerms();
    expect(terms.version).toBe(PAYOUT_TERMS.version);
    expect(terms.sections.length).toBeGreaterThan(3);
    expect(terms.sections[0].heading).toMatch(/appoint TropTix/);
  });

  it('counts only the current version as accepted', () => {
    expect(termsAccepted({ payoutTermsVersion: PAYOUT_TERMS.version })).toBe(
      true
    );
    expect(termsAccepted({ payoutTermsVersion: '2020-01-01' })).toBe(false);
    expect(termsAccepted({ payoutTermsVersion: null })).toBe(false);
  });

  it('records the version and time on the owner’s organization', async () => {
    const { prisma, updateMany } = fakePrisma();
    await acceptPayoutTerms(
      prisma,
      OWNER,
      { version: PAYOUT_TERMS.version },
      NOW
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { ownerUserId: 'owner-1' },
      data: {
        payoutTermsAcceptedAt: NOW,
        payoutTermsVersion: PAYOUT_TERMS.version,
      },
    });
  });

  it('refuses a stale version without writing', async () => {
    const { prisma, updateMany } = fakePrisma();
    await expect(
      acceptPayoutTerms(prisma, OWNER, { version: '2020-01-01' })
    ).rejects.toThrow(ConflictError);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('refuses an anonymous actor and a user with no organization', async () => {
    const { prisma } = fakePrisma(0);
    await expect(
      acceptPayoutTerms(
        prisma,
        { kind: 'anonymous' },
        { version: PAYOUT_TERMS.version }
      )
    ).rejects.toThrow(UnauthorizedError);
    await expect(
      acceptPayoutTerms(prisma, OWNER, { version: PAYOUT_TERMS.version })
    ).rejects.toThrow(NotFoundError);
  });
});
