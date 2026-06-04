-- Minimal seed fixture for FRESH preview branches (per-PR, schema-change DBs).
--
-- This is intentionally small + synthetic. Real dev data lives in the persistent
-- dev branch, loaded once via a pg_dump/pg_restore from the dev DB (see
-- docs/adr/0006-hosted-branching-persistent-dev-branch.md) — NOT here.
-- Keep this file free of any production PII; it is committed and runs on every branch.

-- Demo organizer
insert into public."Users" (id, "createdAt", "updatedAt", email, name, "firstName", "lastName", role)
values ('seed_org_1', now(), now(), 'demo-organizer@troptix.test', 'Demo Organizer', 'Demo', 'Organizer', 'ORGANIZER');

-- Demo published event, owned by the demo organizer
insert into public."Events" (
  id, "createdAt", "updatedAt", "isDraft", name, description, summary,
  organizer, "organizerUserId", "startDate", "endDate", venue, address, country, "countryCode"
) values (
  'seed_event_1', now(), now(), false,
  'TropTix Demo Festival', 'A sample event seeded for preview branches.', 'Sample event for testing',
  'Demo Organizer', 'seed_org_1',
  '2026-08-15 18:00:00', '2026-08-15 23:00:00',
  'Demo Arena', '123 Demo Street, Kingston', 'Jamaica', 'JM'
);

-- Ticket types for the demo event
insert into public."TicketTypes" (
  id, "ticketType", "createdAt", "updatedAt", name, description,
  "maxPurchasePerUser", quantity, "quantitySold",
  "saleStartDate", "saleEndDate", price, "ticketingFees", "eventId"
) values
  ('seed_tt_ga',  'PAID', now(), now(), 'General Admission', 'Standard entry',     10, 500, 0, now(), '2026-08-15 18:00:00', 25.00, 'PASS_TICKET_FEES', 'seed_event_1'),
  ('seed_tt_vip', 'PAID', now(), now(), 'VIP',               'VIP entry with perks', 4,  50, 0, now(), '2026-08-15 18:00:00', 75.00, 'PASS_TICKET_FEES', 'seed_event_1');

-- Demo promo code
insert into public."Promotions" (id, "createdAt", "updatedAt", code, "promotionType", value, "eventId")
values ('seed_promo_1', now(), now(), 'DEMO10', 'PERCENTAGE', 10, 'seed_event_1');
