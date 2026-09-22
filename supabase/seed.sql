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
--   • seed_event_4 — private: published but hidden from /discover and /o/[slug]
--
-- Inventory is one counter standard: availability = capacity - reserved - sold.
--  - `capacity` is NOT NULL — the hold SQL reads it raw (GREATEST(capacity-reserved-sold, 0)).
--  - `reserved`/`sold` are NOT NULL (default 0); set explicitly for clarity.
--    Availability shown to buyers = capacity - reserved - sold.
--  - `priceCents` (integer cents, roadmap 2.12) — the checkout read falls back
--    to price*100, but keep them in sync.
--  - `saleStartsAt`/`saleEndsAt` are full timestamps and the only sale-window
--    columns (ADR 0020).
--  - a non-empty `discountCode` makes a tier GATED (hidden until the code is
--    entered); null/empty is a public tier.

-- Demo organizer
insert into public."Users" (id, "createdAt", "updatedAt", email, name, "firstName", "lastName", role)
values ('seed_org_1', now(), now(), 'demo-organizer@troptix.test', 'Demo Organizer', 'Demo', 'Organizer', 'ORGANIZER');

-- Platform Owner grant so preview branches can exercise Platform View/View-as.
insert into public."Users" (id, "createdAt", "updatedAt", email, name, "firstName", "lastName", "isPlatformOwner")
values ('seed_staff_1', now(), now(), 'demo-staff@troptix.test', 'Demo Staff', 'Demo', 'Staff', true);

-- Demo organizer's Organization (brand). Approved for paid ticketing to match
-- the paid festival below (seed_event_1); not verified.
-- Payout setup complete (both timestamps set) so the request flow is exercisable.
insert into public."Organization" (
  id, "createdAt", "updatedAt", slug, "displayName", "ownerUserId",
  verified, "paidTicketingEnabled", "payoutMeetingAt", "payoutBankLinkedAt"
) values (
  'seed_organization_1', now(), now(), 'demo-organizer', 'Demo Organizer', 'seed_org_1',
  false, true, now() - interval '40 days', now() - interval '40 days'
);

-- A second organization with payout setup INCOMPLETE, so both payout screens
-- show the checklist state (organizer sees the checklist card; Platform View
-- shows unchecked boxes).
insert into public."Users" (id, "createdAt", "updatedAt", email, name, "firstName", "lastName", role)
values ('seed_org_2', now(), now(), 'demo-organizer-2@troptix.test', 'Island Nights', 'Island', 'Nights', 'ORGANIZER');

insert into public."Organization" (
  id, "createdAt", "updatedAt", slug, "displayName", "ownerUserId",
  verified, "paidTicketingEnabled"
) values (
  'seed_organization_2', now(), now(), 'island-nights', 'Island Nights', 'seed_org_2',
  false, true
);

-- Demo Admin: holds a Membership in the demo Organization (teams Phase 1).
-- Nothing reads Membership yet. To claim any seeded persona, set its email
-- to yours BEFORE first sign-in — the provisioning trigger links by email
-- and the row's grants come along. (.test addresses get no magic links.)
insert into public."Users" (id, "createdAt", "updatedAt", email, name, "firstName", "lastName")
values ('seed_admin_1', now(), now(), 'demo-admin@troptix.test', 'Demo Admin', 'Demo', 'Admin');

insert into public."Membership" (id, "createdAt", "updatedAt", role, "organizationId", "userId")
values ('seed_membership_1', now(), now(), 'ADMIN', 'seed_organization_1', 'seed_admin_1');

-- Published events, owned by the demo organizer. `startsAt`/`endsAt` are full
-- timestamps — the only date columns Events has (ADR 0020).
insert into public."Events" (
  id, "createdAt", "updatedAt", "isDraft", "isPrivate", name, description, summary,
  organizer, "organizerUserId", "startsAt", "endsAt",
  venue, address, country, "countryCode", "organizationId",
  "pageTheme", "flyerPalette"
) values
  (
    'seed_event_1', now(), now(), false, false,
    'TropTix Demo Festival', 'A sample paid event seeded for preview branches.', 'Happy-path paid checkout',
    'Demo Organizer', 'seed_org_1',
    '2026-08-15 18:00:00', '2026-08-15 23:00:00',
    'Demo Arena', '123 Demo Street, Kingston', 'Jamaica', 'JM', 'seed_organization_1',
    'wash', '{"dominant": "#7A1E2B", "candidates": ["#FF4757", "#FFD23F", "#7A1E2B"], "chosenAccent": null}'
  ),
  (
    'seed_event_2', now(), now(), false, false,
    'TropTix Free Community Day', 'A free RSVP event seeded for preview branches.', 'Free RSVP path',
    'Demo Organizer', 'seed_org_1',
    '2026-09-05 12:00:00', '2026-09-05 18:00:00',
    'Demo Park', '45 Community Ave, Kingston', 'Jamaica', 'JM', 'seed_organization_1',
    'dark', '{"dominant": "#131020", "candidates": ["#FF4D97", "#FFB454", "#2EE6FF"], "chosenAccent": null}'
  ),
  (
    'seed_event_3', now(), now(), false, false,
    'TropTix Edge-Case Showcase', 'Tiers in unusual states for testing the checkout UI.', 'Near-capacity, sold-out, upcoming, gated',
    'Demo Organizer', 'seed_org_1',
    '2026-09-20 19:00:00', '2026-09-21 01:00:00',
    'Demo Hall', '9 Edge Lane, Kingston', 'Jamaica', 'JM', 'seed_organization_1',
    'off', null
  ),
  (
    'seed_event_4', now(), now(), false, true,
    'TropTix Private Preview', 'A private event: published, but only reachable by direct link (/e/seed_event_4).', 'Private — hidden from listings',
    'Demo Organizer', 'seed_org_1',
    '2026-10-10 20:00:00', '2026-10-11 00:00:00',
    'Demo Loft', '7 Hidden Row, Kingston', 'Jamaica', 'JM', 'seed_organization_1',
    'off', null
  );

-- Ticket types across the four events, one row per state we want to test.
insert into public."TicketTypes" (
  id, "ticketType", "createdAt", "updatedAt", name, description,
  "maxPurchasePerUser", capacity, reserved, sold,
  "saleStartsAt", "saleEndsAt",
  price, "priceCents", "ticketingFees", "discountCode", "eventId"
) values
  -- seed_event_1: happy-path paid tiers, on sale now, plenty available
  ('seed_tt_ga',  'PAID', now(), now(), 'General Admission', 'Standard entry',       10, 500, 0, 0, now(), '2026-08-15 18:00:00', 25.00, 2500, 'PASS_TICKET_FEES',   null, 'seed_event_1'),
  ('seed_tt_vip', 'PAID', now(), now(), 'VIP',               'VIP entry with perks',  4,  50, 0, 0, now(), '2026-08-15 18:00:00', 75.00, 7500, 'PASS_TICKET_FEES',   null, 'seed_event_1'),

  -- seed_event_2: free RSVP tier, on sale now, organizer absorbs fees
  ('seed_tt_rsvp', 'FREE', now(), now(), 'Free RSVP', 'Reserve a free spot',          6, 300, 0, 0, now(), '2026-09-05 12:00:00', 0.00, 0, 'ABSORB_TICKET_FEES', null, 'seed_event_2'),

  -- seed_event_3: edge-case tiers
  --   near-capacity: capacity - reserved - sold = 2  → "Only 2 left"
  ('seed_tt_near',   'PAID', now(), now(), 'Almost Gone',   'Near-capacity tier',      10, 100, 0, 98, now(), '2026-09-20 19:00:00', 30.00, 3000, 'PASS_TICKET_FEES', null, 'seed_event_3'),
  --   sold-out: capacity == sold → availability 0
  ('seed_tt_sold',   'PAID', now(), now(), 'Sold Out',      'Fully sold tier',          4,  50, 0, 50, now(), '2026-09-20 19:00:00', 40.00, 4000, 'PASS_TICKET_FEES', null, 'seed_event_3'),
  --   upcoming: sale window opens in the future → not yet on sale
  ('seed_tt_soon',   'PAID', now(), now(), 'Early Bird',    'Sale opens next week',    10, 200, 0,  0, now() + interval '7 days', '2026-09-20 19:00:00', 20.00, 2000, 'PASS_TICKET_FEES', null, 'seed_event_3'),
  --   gated: non-empty discountCode → hidden until 'UNLOCK2026' is entered
  ('seed_tt_gated',  'PAID', now(), now(), 'Members Only',  'Unlock with UNLOCK2026',   4,  80, 0,  0, now(), '2026-09-20 19:00:00', 60.00, 6000, 'PASS_TICKET_FEES', 'UNLOCK2026', 'seed_event_3'),

  -- seed_event_4: private event still sells by direct link
  ('seed_tt_priv',   'PAID', now(), now(), 'Invite Ticket', 'For link holders',        10, 150, 0,  0, now(), '2026-10-10 20:00:00', 35.00, 3500, 'PASS_TICKET_FEES', null, 'seed_event_4');

-- ── Payout fixtures (docs/plans/2026-08-organizer-payout-requests.md) ────────
-- Two ENDED events with COMPLETED orders give the demo org every balance
-- bucket: seed_event_5 ended > 20 days ago (fully released, holdback over);
-- seed_event_6 ended 5 days ago (80% released, 20% still held → Pending).
-- Relative dates (now() - interval) so the fixture never goes stale.

insert into public."Events" (
  id, "createdAt", "updatedAt", "isDraft", "isPrivate", name, description, summary,
  organizer, "organizerUserId", "startsAt", "endsAt",
  venue, address, country, "countryCode", "organizationId",
  "pageTheme", "flyerPalette"
) values
  (
    'seed_event_5', now() - interval '60 days', now(), false, false,
    'TropTix Carnival Closing', 'An ended paid event with sales, for the payouts ledger.', 'Ended > 20 days ago — fully released',
    'Demo Organizer', 'seed_org_1',
    now() - interval '30 days 5 hours', now() - interval '30 days',
    'Demo Waterfront', '2 Harbour Walk, Kingston', 'Jamaica', 'JM', 'seed_organization_1',
    'off', null
  ),
  (
    'seed_event_6', now() - interval '45 days', now(), false, false,
    'TropTix Sunset Session', 'A recently ended paid event, for the payouts holdback window.', 'Ended 5 days ago — holdback still held',
    'Demo Organizer', 'seed_org_1',
    now() - interval '5 days 4 hours', now() - interval '5 days',
    'Demo Rooftop', '18 Skyline Terrace, Kingston', 'Jamaica', 'JM', 'seed_organization_1',
    'off', null
  );

-- seed_event_5 mixes fee modes so the derived absorbed-fee math is visible:
-- GA passes fees to the buyer; VIP absorbs them (feesCents stored as 0, the
-- organizer's cut computed at read time).
insert into public."TicketTypes" (
  id, "ticketType", "createdAt", "updatedAt", name, description,
  "maxPurchasePerUser", capacity, reserved, sold,
  "saleStartsAt", "saleEndsAt",
  price, "priceCents", "ticketingFees", "discountCode", "eventId"
) values
  ('seed_tt_past_ga',  'PAID', now() - interval '60 days', now(), 'General Admission', 'Standard entry', 10, 200, 0, 3, now() - interval '60 days', now() - interval '30 days 5 hours', 40.00, 4000, 'PASS_TICKET_FEES',   null, 'seed_event_5'),
  ('seed_tt_past_vip', 'PAID', now() - interval '60 days', now(), 'VIP',               'Fees absorbed',   4,  50, 0, 2, now() - interval '60 days', now() - interval '30 days 5 hours', 50.00, 5000, 'ABSORB_TICKET_FEES', null, 'seed_event_5'),
  ('seed_tt_recent',   'PAID', now() - interval '45 days', now(), 'General Admission', 'Standard entry', 10, 150, 0, 2, now() - interval '45 days', now() - interval '5 days 4 hours',  30.00, 3000, 'PASS_TICKET_FEES',   null, 'seed_event_6');

-- Completed orders. Money columns: integer-cents are canonical; the legacy
-- Float dollars mirror them (the ledger falls back to subtotal * 100 when
-- subtotalCents is null, so keeping both in sync mimics real checkout rows).
insert into public."Orders" (
  id, "createdAt", "updatedAt", status, type,
  total, subtotal, fees, "totalCents", "subtotalCents", "feesCents",
  name, "firstName", "lastName", email, "eventId"
) values
  -- 3 × GA @ $40.00, fees passed: 3 × (8% × 4000 + 50) = 1110.
  ('seed_order_1', now() - interval '35 days', now(), 'COMPLETED', 'PAID',
   131.10, 120.00, 11.10, 13110, 12000, 1110,
   'Pat Buyer', 'Pat', 'Buyer', 'pat.buyer@troptix.test', 'seed_event_5'),
  -- 2 × VIP @ $50.00, fees absorbed: buyer pays face value, feesCents 0.
  ('seed_order_2', now() - interval '33 days', now(), 'COMPLETED', 'PAID',
   100.00, 100.00, 0.00, 10000, 10000, 0,
   'Sam Guest', 'Sam', 'Guest', 'sam.guest@troptix.test', 'seed_event_5'),
  -- 2 × GA @ $30.00, fees passed: 2 × (8% × 3000 + 50) = 580.
  ('seed_order_3', now() - interval '8 days', now(), 'COMPLETED', 'PAID',
   65.80, 60.00, 5.80, 6580, 6000, 580,
   'Ali Fan', 'Ali', 'Fan', 'ali.fan@troptix.test', 'seed_event_6');

insert into public."Tickets" (
  id, "createdAt", "updatedAt", status, "ticketsType",
  subtotal, fees, total, "firstName", "lastName", email,
  "eventId", "orderId", "ticketTypeId"
) values
  ('seed_ticket_1', now() - interval '35 days', now(), 'VALID', 'PAID', 40.00, 3.70, 43.70, 'Pat', 'Buyer', 'pat.buyer@troptix.test', 'seed_event_5', 'seed_order_1', 'seed_tt_past_ga'),
  ('seed_ticket_2', now() - interval '35 days', now(), 'VALID', 'PAID', 40.00, 3.70, 43.70, 'Pat', 'Buyer', 'pat.buyer@troptix.test', 'seed_event_5', 'seed_order_1', 'seed_tt_past_ga'),
  ('seed_ticket_3', now() - interval '35 days', now(), 'VALID', 'PAID', 40.00, 3.70, 43.70, 'Pat', 'Buyer', 'pat.buyer@troptix.test', 'seed_event_5', 'seed_order_1', 'seed_tt_past_ga'),
  ('seed_ticket_4', now() - interval '33 days', now(), 'VALID', 'PAID', 50.00, 0.00, 50.00, 'Sam', 'Guest', 'sam.guest@troptix.test', 'seed_event_5', 'seed_order_2', 'seed_tt_past_vip'),
  ('seed_ticket_5', now() - interval '33 days', now(), 'VALID', 'PAID', 50.00, 0.00, 50.00, 'Sam', 'Guest', 'sam.guest@troptix.test', 'seed_event_5', 'seed_order_2', 'seed_tt_past_vip'),
  ('seed_ticket_6', now() - interval '8 days', now(), 'VALID', 'PAID', 30.00, 2.90, 32.90, 'Ali', 'Fan', 'ali.fan@troptix.test', 'seed_event_6', 'seed_order_3', 'seed_tt_recent'),
  ('seed_ticket_7', now() - interval '8 days', now(), 'VALID', 'PAID', 30.00, 2.90, 32.90, 'Ali', 'Fan', 'ali.fan@troptix.test', 'seed_event_6', 'seed_order_3', 'seed_tt_recent');

-- One request in each resolution rendering: an open ask, and a paid one with
-- the rail + bank reference filled so the paid trail is visible.
-- Ledger check: event_5 earned 22000 − 900 absorbed = 21100 (fully released);
-- event_6 earned 6000 → 4800 released + 1200 held. Available =
-- 25900 − 5000 (PAID) − 2000 (REQUESTED) = 18900.
insert into public."PayoutRequest" (
  id, "createdAt", "updatedAt", status, "amountCents", note,
  "resolvedAt", "resolvedByUserId", rail, reference, "adminNote",
  "organizationId", "requestedByUserId"
) values
  ('seed_payout_req_1', now() - interval '25 days', now(), 'PAID', 5000, 'First payout — wire to the usual account',
   now() - interval '24 days', 'seed_staff_1', 'MERCURY', 'MERC-SEED-0001', 'Sent from ops account',
   'seed_organization_1', 'seed_org_1'),
  ('seed_payout_req_2', now() - interval '2 days', now(), 'REQUESTED', 2000, null,
   null, null, null, null, null,
   'seed_organization_1', 'seed_org_1');
