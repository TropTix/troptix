-- Guest ticket-access capability for orders.
--
-- Adds the unguessable `accessToken` behind the confirmation email's `?t=` link,
-- which gates the order / tickets / receipt pages for non-authenticated viewers.
-- Deliberately separate from the PK (`id`) and any user-facing public code so the
-- identifier never doubles as a bearer secret. Nullable (existing rows have none;
-- they remain owner-accessible by session) and unique (one live link per order,
-- revocable by nulling it).
--
-- This is what `prisma migrate diff` emits for `accessToken String? @unique` on
-- `Orders`; authored by hand per ADR 0004 (plain SQL is the source of truth).

-- AlterTable
ALTER TABLE "Orders"
ADD COLUMN "accessToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Orders_accessToken_key" ON "Orders"("accessToken");
