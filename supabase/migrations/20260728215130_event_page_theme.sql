-- CreateEnum
CREATE TYPE "EventPageTheme" AS ENUM ('off', 'wash', 'dark');

-- AlterTable
ALTER TABLE "Events" ADD COLUMN     "flyerPalette" JSONB,
ADD COLUMN     "pageTheme" "EventPageTheme" NOT NULL DEFAULT 'off';

