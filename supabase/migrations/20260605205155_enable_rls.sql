-- Enable Row Level Security on all application tables.
--
-- RLS was enabled on prod out-of-band during the troptix->public cutover but was
-- never captured in a migration, so databases built from migrations (the persistent
-- dev branch and every preview branch) had it off. This closes that gap: every
-- environment becomes consistent, and prod is reproducible from migrations.
--
-- Idempotent: enabling RLS where it is already enabled is a no-op, so applying this
-- to prod (already enabled) does nothing. With no policies defined, RLS denies
-- anon/authenticated by default; the app connects as a role that bypasses RLS
-- (postgres, rolbypassrls = true), so application access is unaffected.

alter table public."Users"               enable row level security;
alter table public."SocialMediaAccounts" enable row level security;
alter table public."Events"              enable row level security;
alter table public."Orders"              enable row level security;
alter table public."Tickets"             enable row level security;
alter table public."Promotions"          enable row level security;
alter table public."TicketTypes"         enable row level security;
alter table public."DelegatedUsers"      enable row level security;
