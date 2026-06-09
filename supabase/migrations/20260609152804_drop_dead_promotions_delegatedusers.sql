-- DropForeignKey
ALTER TABLE "DelegatedUsers" DROP CONSTRAINT "DelegatedUsers_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Promotions" DROP CONSTRAINT "Promotions_eventId_fkey";

-- DropTable
DROP TABLE "DelegatedUsers";

-- DropTable
DROP TABLE "Promotions";

-- DropEnum
DROP TYPE "DelegatedAccess";

-- DropEnum
DROP TYPE "PromotionType";

