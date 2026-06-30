-- AlterEnum
ALTER TYPE "SocialMediaAccountType" ADD VALUE 'LINKEDIN';

-- AlterTable
ALTER TABLE "Events" ADD COLUMN "organizationId" TEXT;

-- AlterTable
ALTER TABLE "SocialMediaAccounts" ADD COLUMN "organizationId" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "logoUrl" VARCHAR(2000),
    "bio" TEXT,
    "website" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Spotlight" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT,
    "imageUrl" VARCHAR(2000),
    "description" VARCHAR(350),
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Spotlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_ownerUserId_idx" ON "Organization"("ownerUserId");

-- CreateIndex
CREATE INDEX "Spotlight_eventId_idx" ON "Spotlight"("eventId");

-- CreateIndex
CREATE INDEX "Events_organizationId_idx" ON "Events"("organizationId");

-- CreateIndex
CREATE INDEX "SocialMediaAccounts_organizationId_idx" ON "SocialMediaAccounts"("organizationId");

-- AddForeignKey
ALTER TABLE "SocialMediaAccounts" ADD CONSTRAINT "SocialMediaAccounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Events" ADD CONSTRAINT "Events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "Users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spotlight" ADD CONSTRAINT "Spotlight_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
