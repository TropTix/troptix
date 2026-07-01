-- Paid checkout on the Checkout Sessions API (ADR 0018).
--
-- Additive and nullable — no behavior change to the live free flow. Opens the
-- slots the paid `/e/` flow needs:
--   * ReservationStatus.REFUNDED — terminal state for a payment that landed after
--     the hold expired and could not be re-acquired (auto-refunded).
--   * Reservation.stripeCheckoutSessionId — the Checkout Session that drives the
--     paid flow (unique; one Session per reservation).
--   * Reservation.stripeRefundId — set on the expiry-race auto-refund.
--
-- The columns + unique index are what `prisma migrate diff` emits for
-- `stripeCheckoutSessionId String? @unique` and `stripeRefundId String?`. Authored
-- by hand because `prisma migrate diff` is currently blocked by the cross-schema
-- auth.users FK (needs `auth` in the datasource `schemas`); plain SQL is the source
-- of truth regardless (ADR 0004).

-- AlterEnum
-- Postgres allows only one ADD VALUE per statement; the new value is unused in
-- this migration, so it is safe to add here and reference from later writes.
ALTER TYPE "ReservationStatus"
ADD VALUE 'REFUNDED';

-- AlterTable
ALTER TABLE "Reservation"
ADD COLUMN "stripeCheckoutSessionId" TEXT,
    ADD COLUMN "stripeRefundId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_stripeCheckoutSessionId_key" ON "Reservation"("stripeCheckoutSessionId");
