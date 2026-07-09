-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "paidTicketingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paidTicketingRequestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Events" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TicketTypes" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Orders_eventId_status_idx" ON "Orders"("eventId", "status");

-- CreateIndex
CREATE INDEX "Events_organizerUserId_idx" ON "Events"("organizerUserId");

-- Backfill sortOrder: per-event display order by creation time (new tiers get
-- their order from the write service).
UPDATE "TicketTypes" tt
SET "sortOrder" = ranked.rn
FROM (
  SELECT id,
         (row_number() OVER (PARTITION BY "eventId" ORDER BY "createdAt", id) - 1) AS rn
  FROM "TicketTypes"
) ranked
WHERE tt.id = ranked.id;

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

