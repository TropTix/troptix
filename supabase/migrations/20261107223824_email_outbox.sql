-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELAYED', 'DELIVERED', 'BOUNCED', 'SUPPRESSED', 'FAILED', 'COMPLAINED');

-- DropTable
DROP TABLE "OutboxMessage";

-- DropEnum
DROP TYPE "OutboxStatus";

-- CreateTable
CREATE TABLE "Email" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "resendId" TEXT,
    "sentAt" TIMESTAMP(3),
    "statusAt" TIMESTAMP(3),

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Email_idempotencyKey_key" ON "Email"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Email_resendId_key" ON "Email"("resendId");

-- CreateIndex
CREATE INDEX "Email_status_nextAttemptAt_idx" ON "Email"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Email_subjectId_idx" ON "Email"("subjectId");


alter table public."Email" enable row level security;
