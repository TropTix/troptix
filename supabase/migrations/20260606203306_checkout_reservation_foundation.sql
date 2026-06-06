-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('FREE', 'PAID', 'COMPLEMENTARY');
-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'CONVERTED', 'EXPIRED', 'RELEASED');
-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.
ALTER TYPE "TicketStatus"
ADD VALUE 'VALID';
ALTER TYPE "TicketStatus"
ADD VALUE 'USED';
ALTER TYPE "TicketStatus"
ADD VALUE 'CANCELLED';
ALTER TYPE "TicketStatus"
ADD VALUE 'REFUNDED';
-- AlterTable
ALTER TABLE "Events"
ADD COLUMN "endsAt" TIMESTAMP(3),
    ADD COLUMN "startsAt" TIMESTAMP(3);
-- AlterTable
ALTER TABLE "Orders"
ADD COLUMN "feesCents" INTEGER,
    ADD COLUMN "subtotalCents" INTEGER,
    ADD COLUMN "totalCents" INTEGER,
    ADD COLUMN "type" "OrderType";
-- AlterTable
ALTER TABLE "TicketTypes"
ADD COLUMN "capacity" INTEGER,
    ADD COLUMN "priceCents" INTEGER,
    ADD COLUMN "reserved" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "saleEndsAt" TIMESTAMP(3),
    ADD COLUMN "saleStartsAt" TIMESTAMP(3),
    ADD COLUMN "sold" INTEGER NOT NULL DEFAULT 0;
-- AlterTable
ALTER TABLE "Tickets"
ADD COLUMN "checkinTimestamp" TIMESTAMP(3);
-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "stripePaymentIntentId" TEXT,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "feesCents" INTEGER NOT NULL DEFAULT 0,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ReservationItem" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "feesCents" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ReservationItem_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ProcessedStripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "Reservation_stripePaymentIntentId_key" ON "Reservation"("stripePaymentIntentId");
-- CreateIndex
CREATE UNIQUE INDEX "Reservation_orderId_key" ON "Reservation"("orderId");
-- CreateIndex
CREATE INDEX "Reservation_eventId_idx" ON "Reservation"("eventId");
-- CreateIndex
CREATE INDEX "Reservation_status_idx" ON "Reservation"("status");
-- CreateIndex
CREATE INDEX "Reservation_expiresAt_idx" ON "Reservation"("expiresAt");
-- CreateIndex
CREATE INDEX "ReservationItem_reservationId_idx" ON "ReservationItem"("reservationId");
-- CreateIndex
CREATE INDEX "ReservationItem_ticketTypeId_idx" ON "ReservationItem"("ticketTypeId");
-- CreateIndex
CREATE INDEX "OutboxMessage_status_idx" ON "OutboxMessage"("status");
-- AddForeignKey
ALTER TABLE "Reservation"
ADD CONSTRAINT "Reservation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Reservation"
ADD CONSTRAINT "Reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE
SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Reservation"
ADD CONSTRAINT "Reservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE
SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ReservationItem"
ADD CONSTRAINT "ReservationItem_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ReservationItem"
ADD CONSTRAINT "ReservationItem_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketTypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
alter table public."Reservation" enable row level security;
alter table public."ReservationItem" enable row level security;
alter table public."OutboxMessage" enable row level security;
alter table public."ProcessedStripeEvent" enable row level security;