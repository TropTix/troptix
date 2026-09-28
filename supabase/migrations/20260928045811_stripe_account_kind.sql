-- Which shape the organizer's Stripe account is: a Connect account or a
-- Global Payouts recipient (docs/plans/2026-09-global-payouts-rail.md,
-- ADR 0034). Set once at creation; every account so far is Connect.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "stripeAccountKind" TEXT;

UPDATE "Organization" SET "stripeAccountKind" = 'CONNECT' WHERE "stripeAccountId" IS NOT NULL;
