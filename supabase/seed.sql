-- Seed fixture for FRESH preview branches (per-PR, schema-change DBs).
--
-- This is intentionally small + synthetic. Real dev data lives in the persistent
-- dev branch, loaded once via a pg_dump/pg_restore from the dev DB (see
-- docs/adr/0006-hosted-branching-persistent-dev-branch.md) — NOT here.
-- Keep this file free of any production PII; it is committed and runs on every branch.
--
-- It seeds a spread of event/tier STATES so a reviewer can exercise the whole
-- checkout UI on the PR's preview deploy without hand-editing rows:
--   • seed_event_1 — happy-path paid festival (GA + VIP, plenty available)
--   • seed_event_2 — free RSVP event
--   • seed_event_3 — edge cases: near-capacity, sold-out, upcoming-sale, gated
--
-- Reservation-era columns MUST be set, not just the legacy ones:
--  - `capacity` — the hold SQL reads the raw column (GREATEST(capacity-reserved-sold, 0))
--    with NO quantity fallback, so a NULL capacity reserves as sold-out.
--  - `reserved`/`sold` are NOT NULL (default 0); set explicitly for clarity.
--    Availability shown to buyers = capacity - reserved - sold.
--  - `priceCents` (integer cents, roadmap 2.12) and the atomic
--    `saleStartsAt`/`saleEndsAt` sale window (roadmap 2.10) — the checkout read
--    falls back to price*100 / the split columns, but keep them in sync.
--  - a non-empty `discountCode` makes a tier GATED (hidden until the code is
--    entered); null/empty is a public tier.

-- Demo organizer
insert into public."Users" (id, "createdAt", "updatedAt", email, name, "firstName", "lastName", role)
values ('seed_org_1', now(), now(), 'demo-organizer@troptix.test', 'Demo Organizer', 'Demo', 'Organizer', 'ORGANIZER');

-- Published events, owned by the demo organizer. Legacy split date columns AND
-- the reservation-era atomic `startsAt`/`endsAt` (roadmap 2.10) are both set.
insert into public."Events" (
  id, "createdAt", "updatedAt", "isDraft", name, description, summary,
  organizer, "organizerUserId", "startDate", "endDate", "startsAt", "endsAt",
  venue, address, country, "countryCode"
) values
  (
    'seed_event_1', now(), now(), false,
    'TropTix Demo Festival', 'A sample paid event seeded for preview branches.', 'Happy-path paid checkout',
    'Demo Organizer', 'seed_org_1',
    '2026-08-15 18:00:00', '2026-08-15 23:00:00',
    '2026-08-15 18:00:00', '2026-08-15 23:00:00',
    'Demo Arena', '123 Demo Street, Kingston', 'Jamaica', 'JM'
  ),
  (
    'seed_event_2', now(), now(), false,
    'TropTix Free Community Day', 'A free RSVP event seeded for preview branches.', 'Free RSVP path',
    'Demo Organizer', 'seed_org_1',
    '2026-09-05 12:00:00', '2026-09-05 18:00:00',
    '2026-09-05 12:00:00', '2026-09-05 18:00:00',
    'Demo Park', '45 Community Ave, Kingston', 'Jamaica', 'JM'
  ),
  (
    'seed_event_3', now(), now(), false,
    'TropTix Edge-Case Showcase', 'Tiers in unusual states for testing the checkout UI.', 'Near-capacity, sold-out, upcoming, gated',
    'Demo Organizer', 'seed_org_1',
    '2026-09-20 19:00:00', '2026-09-21 01:00:00',
    '2026-09-20 19:00:00', '2026-09-21 01:00:00',
    'Demo Hall', '9 Edge Lane, Kingston', 'Jamaica', 'JM'
  );

-- Ticket types across the three events, one row per state we want to test.
insert into public."TicketTypes" (
  id, "ticketType", "createdAt", "updatedAt", name, description,
  "maxPurchasePerUser", quantity, "quantitySold", capacity, reserved, sold,
  "saleStartDate", "saleEndDate", "saleStartsAt", "saleEndsAt",
  price, "priceCents", "ticketingFees", "discountCode", "eventId"
) values
  -- seed_event_1: happy-path paid tiers, on sale now, plenty available
  ('seed_tt_ga',  'PAID', now(), now(), 'General Admission', 'Standard entry',       10, 500, 0, 500, 0, 0, now(), '2026-08-15 18:00:00', now(), '2026-08-15 18:00:00', 25.00, 2500, 'PASS_TICKET_FEES',   null, 'seed_event_1'),
  ('seed_tt_vip', 'PAID', now(), now(), 'VIP',               'VIP entry with perks',  4,  50, 0,  50, 0, 0, now(), '2026-08-15 18:00:00', now(), '2026-08-15 18:00:00', 75.00, 7500, 'PASS_TICKET_FEES',   null, 'seed_event_1'),

  -- seed_event_2: free RSVP tier, on sale now, organizer absorbs fees
  ('seed_tt_rsvp', 'FREE', now(), now(), 'Free RSVP', 'Reserve a free spot',          6, 300, 0, 300, 0, 0, now(), '2026-09-05 12:00:00', now(), '2026-09-05 12:00:00', 0.00, 0, 'ABSORB_TICKET_FEES', null, 'seed_event_2'),

  -- seed_event_3: edge-case tiers
  --   near-capacity: capacity - reserved - sold = 2  → "Only 2 left"
  ('seed_tt_near',   'PAID', now(), now(), 'Almost Gone',   'Near-capacity tier',      10, 100, 98, 100, 0, 98, now(), '2026-09-20 19:00:00', now(), '2026-09-20 19:00:00', 30.00, 3000, 'PASS_TICKET_FEES', null, 'seed_event_3'),
  --   sold-out: capacity == sold → availability 0
  ('seed_tt_sold',   'PAID', now(), now(), 'Sold Out',      'Fully sold tier',          4,  50, 50,  50, 0, 50, now(), '2026-09-20 19:00:00', now(), '2026-09-20 19:00:00', 40.00, 4000, 'PASS_TICKET_FEES', null, 'seed_event_3'),
  --   upcoming: sale window opens in the future → not yet on sale
  ('seed_tt_soon',   'PAID', now(), now(), 'Early Bird',    'Sale opens next week',    10, 200,  0, 200, 0,  0, now() + interval '7 days', '2026-09-20 19:00:00', now() + interval '7 days', '2026-09-20 19:00:00', 20.00, 2000, 'PASS_TICKET_FEES', null, 'seed_event_3'),
  --   gated: non-empty discountCode → hidden until 'UNLOCK2026' is entered
  ('seed_tt_gated',  'PAID', now(), now(), 'Members Only',  'Unlock with UNLOCK2026',   4,  80,  0,  80, 0,  0, now(), '2026-09-20 19:00:00', now(), '2026-09-20 19:00:00', 60.00, 6000, 'PASS_TICKET_FEES', 'UNLOCK2026', 'seed_event_3');
