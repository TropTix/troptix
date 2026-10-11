-- DropIndex
DROP INDEX "Organization_ownerUserId_key";

-- CreateIndex
CREATE INDEX "Organization_ownerUserId_idx" ON "Organization"("ownerUserId");

