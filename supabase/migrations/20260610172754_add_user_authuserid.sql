-- Supabase Auth identity: add User.authUserId (ADR 0011, plan Stage 1c step 1).
--
-- Additive and nullable — no behavior change. This only opens the slot for the
-- Firebase->Supabase identity link; the backfill, orphan gate, RLS policies, and
-- the verification/issuance cutover land in later 1c PRs. `User.id` stays the app
-- PK; `authUserId` becomes the auth key. They are NOT equal for migrated users.
--
-- The column + unique index are what `prisma migrate diff` emits for
-- `authUserId String? @unique @db.Uuid`. The cross-schema FK to auth.users is
-- hand-appended below (Prisma doesn't model the `auth` schema), same convention
-- as the hand-authored RLS migration. ON DELETE SET NULL: deleting a Supabase
-- auth user unlinks the app row rather than cascading away a financial/attendance
-- record.

-- AlterTable
ALTER TABLE "Users" ADD COLUMN "authUserId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Users_authUserId_key" ON "Users"("authUserId");

-- AddForeignKey (hand-appended: auth.users is not a Prisma model)
ALTER TABLE "Users"
  ADD CONSTRAINT "Users_authUserId_fkey"
  FOREIGN KEY ("authUserId") REFERENCES auth.users(id)
  ON DELETE SET NULL ON UPDATE CASCADE;
