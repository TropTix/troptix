-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "payoutTermsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "payoutTermsVersion" VARCHAR(20);

