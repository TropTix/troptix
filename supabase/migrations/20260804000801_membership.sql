-- The org-level Membership grant (teams Phase 1, ADR 0024). Both FKs
-- CASCADE: a grant is meaningless without its Organization or User, and
-- removing a member never touches events. Keeping the Owner out of this
-- table is left to the Phase 2 invite action — a CHECK cannot reach the
-- Organization table.

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('ADMIN');

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense-only, per the no-policy convention (the app's role bypasses RLS).
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;

