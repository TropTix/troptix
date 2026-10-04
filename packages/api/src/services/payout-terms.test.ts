import { ownedOrganizations } from './_shared/owned-organizations.fixtures';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@troptix/db';
import type { Actor } from '../trpc/context';
import { PAYOUT_TERMS } from '../legal/payoutTerms';
import { PayoutConfig } from './_shared/payouts';
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

function fakePrisma(count = 1, organizationIds = ['org-1']) {
  const updateMany = vi.fn().mockResolvedValue({ count });
  const prisma = {
    organization: { ...ownedOrganizations(organizationIds), updateMany },
  } as unknown as PrismaClient;
  return { prisma, updateMany };
}

describe('payout terms', () => {
  it('serves the current version with its sections', () => {
    const terms = currentPayoutTerms();
    expect(terms.version).toBe(PAYOUT_TERMS.version);
    expect(terms.sections.length).toBeGreaterThan(3);
    expect(terms.sections[0].heading).toMatch(/appoint TropTix/);
  });

  it('states the holdback from PayoutConfig, never a number of its own', () => {
    const holdback = PAYOUT_TERMS.sections.find(
      (section) => section.heading === 'Holdback'
    );
    expect(holdback?.body).toContain(
      `${PayoutConfig.HOLDBACK_PERCENT}% for ${PayoutConfig.HOLDBACK_DAYS} days`
    );
    const numbers = PAYOUT_TERMS.sections
      .map((section) => section.body)
      .join(' ')
      .match(/\b\d+%|\b\d+ days\b/g);
    expect(numbers).toEqual([
      `${PayoutConfig.HOLDBACK_PERCENT}%`,
      `${PayoutConfig.HOLDBACK_DAYS} days`,
    ]);
  });

  it('is the version the preview seed marks as accepted', () => {
    const seed = readFileSync(
      join(__dirname, '../../../../supabase/seed.sql'),
      'utf8'
    );
    expect(seed).toContain(`'${PAYOUT_TERMS.version}'`);
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
      where: { id: 'org-1' },
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
    const { prisma } = fakePrisma(0, []);
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
