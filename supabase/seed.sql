-- Minimal seed fixture for FRESH preview branches (per-PR, schema-change DBs).
--
-- This is intentionally small + synthetic. Real dev data lives in the persistent
-- dev branch, loaded once via a pg_dump/pg_restore from the dev DB (see
-- docs/adr/0006-hosted-branching-persistent-dev-branch.md) — NOT here.
-- Keep this file free of any production PII; it is committed and runs on every branch.

-- Demo organizer
insert into public."Users" (id, "createdAt", "updatedAt", email, name, "firstName", "lastName", role)
values ('seed_org_1', now(), now(), 'demo-organizer@troptix.test', 'Demo Organizer', 'Demo', 'Organizer', 'ORGANIZER');

-- Demo published event, owned by the demo organizer.
-- Set both the legacy split date columns AND the reservation-era atomic
-- `startsAt`/`endsAt` (roadmap 2.10) so the fixture matches the current schema.
insert into public."Events" (
  id, "createdAt", "updatedAt", "isDraft", name, description, summary,
  organizer, "organizerUserId", "startDate", "endDate", "startsAt", "endsAt",
  venue, address, country, "countryCode"
) values (
  'seed_event_1', now(), now(), false,
  'TropTix Demo Festival', 'A sample event seeded for preview branches.', 'Sample event for testing',
  'Demo Organizer', 'seed_org_1',
  '2026-08-15 18:00:00', '2026-08-15 23:00:00',
  '2026-08-15 18:00:00', '2026-08-15 23:00:00',
  'Demo Arena', '123 Demo Street, Kingston', 'Jamaica', 'JM'
);

-- Ticket types for the demo event.
--
-- Reservation-era columns MUST be set, not just the legacy ones:
--  - `capacity` — the hold SQL reads the raw column (GREATEST(capacity-reserved-sold, 0))
--    with NO quantity fallback, so a NULL capacity reserves as sold-out.
--  - `reserved`/`sold` are NOT NULL (default 0); set explicitly for clarity.
--  - `priceCents` (integer cents, roadmap 2.12) and the atomic
--    `saleStartsAt`/`saleEndsAt` sale window (roadmap 2.10) — the checkout
--    read falls back to price*100 / the split columns, but keep them in sync.
insert into public."TicketTypes" (
  id, "ticketType", "createdAt", "updatedAt", name, description,
  "maxPurchasePerUser", quantity, "quantitySold", capacity, reserved, sold,
  "saleStartDate", "saleEndDate", "saleStartsAt", "saleEndsAt",
  price, "priceCents", "ticketingFees", "eventId"
) values
  ('seed_tt_ga',  'PAID', now(), now(), 'General Admission', 'Standard entry',     10, 500, 0, 500, 0, 0, now(), '2026-08-15 18:00:00', now(), '2026-08-15 18:00:00', 25.00, 2500, 'PASS_TICKET_FEES', 'seed_event_1'),
  ('seed_tt_vip', 'PAID', now(), now(), 'VIP',               'VIP entry with perks', 4,  50, 0,  50, 0, 0, now(), '2026-08-15 18:00:00', now(), '2026-08-15 18:00:00', 75.00, 7500, 'PASS_TICKET_FEES', 'seed_event_1');
