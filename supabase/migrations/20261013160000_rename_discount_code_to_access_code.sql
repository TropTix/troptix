alter table public."TicketTypes" rename column "discountCode" to "accessCode";
-- Canonical form: trimmed, uppercased, empty becomes NULL (ADR 0035).
update public."TicketTypes"
set "accessCode" = nullif(upper(trim("accessCode")), '')
where "accessCode" is not null;
