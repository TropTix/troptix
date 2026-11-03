-- Grants replace the ticket-type access code (ADR 0037). Each distinct code on
-- an event becomes one unlimited grant over every type that carried it, and
-- those types become hidden, so a migrated code behaves exactly as before.

ALTER TABLE "TicketTypes" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Grant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "holderEmail" TEXT,
    "holderName" TEXT,
    "sentAt" TIMESTAMP(3),
    "eventId" TEXT NOT NULL,

    CONSTRAINT "Grant_pkey" PRIMARY KEY ("id"),
    -- A use is taken with a conditional UPDATE; these make an overrun or a
    -- double release fail loudly instead of drifting.
    CONSTRAINT "Grant_usedCount_check" CHECK (
      "usedCount" >= 0 AND ("maxUses" IS NULL OR "usedCount" <= "maxUses")
    ),
    CONSTRAINT "Grant_maxUses_check" CHECK ("maxUses" IS NULL OR "maxUses" >= 1),
    CONSTRAINT "Grant_quantity_check" CHECK ("quantity" IS NULL OR "quantity" >= 1)
);

CREATE TABLE "GrantTicketType" (
    "grantId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,

    CONSTRAINT "GrantTicketType_pkey" PRIMARY KEY ("grantId","ticketTypeId")
);

ALTER TABLE "Reservation" ADD COLUMN "grantId" TEXT;

CREATE UNIQUE INDEX "Grant_eventId_code_key" ON "Grant"("eventId", "code");
CREATE INDEX "GrantTicketType_ticketTypeId_idx" ON "GrantTicketType"("ticketTypeId");
CREATE INDEX "Reservation_grantId_idx" ON "Reservation"("grantId");

ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "Grant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Grant" ADD CONSTRAINT "Grant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrantTicketType" ADD CONSTRAINT "GrantTicketType_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "Grant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrantTicketType" ADD CONSTRAINT "GrantTicketType_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketTypes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Codes must never be readable through the anon key; no policies, as for
-- every other application table.
ALTER TABLE "Grant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GrantTicketType" ENABLE ROW LEVEL SECURITY;

-- Codes are already canonical (trimmed, uppercased) since 20261013160000.
INSERT INTO "Grant" ("id", "createdAt", "updatedAt", "eventId", "code")
SELECT gen_random_uuid()::text, now(), now(), "eventId", "accessCode"
FROM "TicketTypes"
WHERE "accessCode" IS NOT NULL
GROUP BY "eventId", "accessCode";

INSERT INTO "GrantTicketType" ("grantId", "ticketTypeId")
SELECT g."id", t."id"
FROM "TicketTypes" t
JOIN "Grant" g ON g."eventId" = t."eventId" AND g."code" = t."accessCode";

UPDATE "TicketTypes" SET "hidden" = true WHERE "accessCode" IS NOT NULL;

ALTER TABLE "TicketTypes" DROP COLUMN "accessCode";
