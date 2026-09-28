-- The organizer's Stripe account (docs/plans/2026-09-stripe-connect-us-payout-rail.md,
-- ADR 0030). One per Organization; onboarding state lives in Stripe.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "stripeAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_stripeAccountId_key" ON "Organization"("stripeAccountId");

