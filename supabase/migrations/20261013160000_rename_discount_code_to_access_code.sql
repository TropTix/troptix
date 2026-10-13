alter table public."TicketTypes" rename column "discountCode" to "accessCode";
-- Canonical form: whitespace stripped at both ends, uppercased, empty becomes
-- NULL (ADR 0035). regexp_replace rather than trim(), which only strips spaces.
update public."TicketTypes"
set "accessCode" = nullif(
  upper(regexp_replace("accessCode", '^\s+|\s+$', '', 'g')),
  ''
)
where "accessCode" is not null;
