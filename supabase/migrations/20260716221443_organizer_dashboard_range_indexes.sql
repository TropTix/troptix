-- DropIndex
DROP INDEX "Tickets_eventId_idx";

-- DropIndex
DROP INDEX "Orders_eventId_status_idx";

-- CreateIndex
CREATE INDEX "Tickets_eventId_createdAt_idx" ON "Tickets"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "Orders_eventId_status_createdAt_idx" ON "Orders"("eventId", "status", "createdAt");

