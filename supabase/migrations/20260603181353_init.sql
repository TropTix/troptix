-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PATRON', 'ORGANIZER', 'PROMOTER');

-- CreateEnum
CREATE TYPE "SocialMediaAccountType" AS ENUM ('UNKNOWN', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'TWITTER');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('AVAILABLE', 'NOT_AVAILABLE');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('FREE', 'PAID', 'COMPLEMENTARY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('UNKNOWN', 'PERCENTAGE', 'DOLLAR_AMOUNT');

-- CreateEnum
CREATE TYPE "TicketFeeStructure" AS ENUM ('ABSORB_TICKET_FEES', 'PASS_TICKET_FEES');

-- CreateEnum
CREATE TYPE "DelegatedAccess" AS ENUM ('OWNER', 'TICKET_SCANNER');

-- CreateTable
CREATE TABLE "Users" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "stripeId" TEXT,
    "role" "Role" NOT NULL DEFAULT 'PATRON',
    "telephoneNumber" TEXT,
    "billingAddress1" TEXT,
    "billingAddress2" TEXT,
    "billingCity" TEXT,
    "billingCountry" TEXT,
    "billingZip" TEXT,
    "billingState" TEXT,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialMediaAccounts" (
    "id" TEXT NOT NULL,
    "socialMediaAccountType" "SocialMediaAccountType" NOT NULL DEFAULT 'UNKNOWN',
    "link" TEXT,
    "userId" TEXT,

    CONSTRAINT "SocialMediaAccounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tickets" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "status" "TicketStatus" NOT NULL DEFAULT 'NOT_AVAILABLE',
    "ticketsType" "TicketType" DEFAULT 'PAID',
    "fees" DOUBLE PRECISION,
    "subtotal" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "eventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ticketTypeId" TEXT,
    "userId" TEXT,

    CONSTRAINT "Tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Orders" (
    "id" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripePaymentId" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "total" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION,
    "fees" DOUBLE PRECISION,
    "name" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "cardType" TEXT,
    "cardLast4" TEXT,
    "telephoneNumber" TEXT,
    "billingAddress1" TEXT,
    "billingAddress2" TEXT,
    "billingCity" TEXT,
    "billingCountry" TEXT,
    "billingZip" TEXT,
    "billingState" TEXT,
    "ticketsLink" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "Orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Events" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" VARCHAR(2000),
    "name" TEXT NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "summary" TEXT,
    "organizer" TEXT NOT NULL,
    "organizerUserId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3),
    "endDate" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "venue" TEXT,
    "address" TEXT NOT NULL,
    "country" TEXT,
    "countryCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,

    CONSTRAINT "Events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "promotionType" "PromotionType" NOT NULL DEFAULT 'UNKNOWN',
    "value" DOUBLE PRECISION NOT NULL,
    "eventId" TEXT,

    CONSTRAINT "Promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTypes" (
    "id" TEXT NOT NULL,
    "ticketType" "TicketType" DEFAULT 'PAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "maxPurchasePerUser" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantitySold" INTEGER DEFAULT 0,
    "saleStartDate" TIMESTAMP(3) NOT NULL,
    "saleStartTime" TIMESTAMP(3),
    "saleEndDate" TIMESTAMP(3) NOT NULL,
    "saleEndTime" TIMESTAMP(3),
    "price" DOUBLE PRECISION NOT NULL,
    "ticketingFees" "TicketFeeStructure" NOT NULL DEFAULT 'PASS_TICKET_FEES',
    "eventId" TEXT NOT NULL,
    "discountCode" TEXT,

    CONSTRAINT "TicketTypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelegatedUsers" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "delegatedAccess" "DelegatedAccess" NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "DelegatedUsers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");

-- CreateIndex
CREATE INDEX "SocialMediaAccounts_userId_idx" ON "SocialMediaAccounts"("userId");

-- CreateIndex
CREATE INDEX "Tickets_eventId_idx" ON "Tickets"("eventId");

-- CreateIndex
CREATE INDEX "Tickets_orderId_idx" ON "Tickets"("orderId");

-- CreateIndex
CREATE INDEX "Tickets_ticketTypeId_idx" ON "Tickets"("ticketTypeId");

-- CreateIndex
CREATE INDEX "Tickets_userId_idx" ON "Tickets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Orders_stripePaymentId_key" ON "Orders"("stripePaymentId");

-- CreateIndex
CREATE INDEX "Orders_eventId_idx" ON "Orders"("eventId");

-- CreateIndex
CREATE INDEX "Orders_userId_idx" ON "Orders"("userId");

-- CreateIndex
CREATE INDEX "Promotions_eventId_idx" ON "Promotions"("eventId");

-- CreateIndex
CREATE INDEX "TicketTypes_eventId_idx" ON "TicketTypes"("eventId");

-- CreateIndex
CREATE INDEX "DelegatedUsers_eventId_idx" ON "DelegatedUsers"("eventId");

-- AddForeignKey
ALTER TABLE "SocialMediaAccounts" ADD CONSTRAINT "SocialMediaAccounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tickets" ADD CONSTRAINT "Tickets_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tickets" ADD CONSTRAINT "Tickets_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tickets" ADD CONSTRAINT "Tickets_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketTypes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tickets" ADD CONSTRAINT "Tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orders" ADD CONSTRAINT "Orders_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotions" ADD CONSTRAINT "Promotions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTypes" ADD CONSTRAINT "TicketTypes_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegatedUsers" ADD CONSTRAINT "DelegatedUsers_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

