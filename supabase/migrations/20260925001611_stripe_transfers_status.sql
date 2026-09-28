-- Stripe's transfers capability status, mirrored from the webhook and the
-- onboarding return so the payouts page reads the database, not Stripe (ADR 0032).

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "stripeTransfersStatus" TEXT;

