-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "paidTicketingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paidTicketingRequestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Events" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Orders_eventId_status_idx" ON "Orders"("eventId", "status");

-- CreateIndex
CREATE INDEX "Events_organizerUserId_idx" ON "Events"("organizerUserId");

-- Backfill paidTicketingEnabled: any organization whose owner has ever created a
-- paid ticket type is currently selling paid tickets — keep that capability when
-- the paid gate lands (ADR 0019's required rollout backfill).
UPDATE "Organization" o
SET "paidTicketingEnabled" = true
WHERE EXISTS (
  SELECT 1
  FROM "Events" e
  JOIN "TicketTypes" tt ON tt."eventId" = e.id
  WHERE e."organizerUserId" = o."ownerUserId"
    AND tt."price" > 0
);

