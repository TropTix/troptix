-- Payout requests (docs/plans/2026-08-organizer-payout-requests.md). The row
-- records the ask and the paid trail; money moves off-platform. Never bank
-- details in any column. Organization also gains payout-setup timestamps and
-- per-org release-policy overrides (null = platform defaults).

-- CreateEnum
CREATE TYPE "PayoutRequestStatus" AS ENUM ('REQUESTED', 'CANCELLED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "PayoutRail" AS ENUM ('MERCURY', 'STRIPE', 'OTHER');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "payoutBankLinkedAt" TIMESTAMP(3),
ADD COLUMN     "payoutHoldbackDays" INTEGER,
ADD COLUMN     "payoutHoldbackPercent" INTEGER,
ADD COLUMN     "payoutMeetingAt" TIMESTAMP(3),
ADD COLUMN     "payoutReleaseAtSale" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "PayoutRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "amountCents" INTEGER NOT NULL,
    "note" VARCHAR(500),
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "rail" "PayoutRail",
    "reference" VARCHAR(200),
    "adminNote" VARCHAR(500),
    "organizationId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,

    CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutRequest_organizationId_idx" ON "PayoutRequest"("organizationId");

-- CreateIndex
CREATE INDEX "PayoutRequest_status_idx" ON "PayoutRequest"("status");

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defense-only, per the no-policy convention (the app's role bypasses RLS).
ALTER TABLE "PayoutRequest" ENABLE ROW LEVEL SECURITY;

