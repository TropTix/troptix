-- The reservation-expiry sweep is scheduled with pg_cron + pg_net. Enabling the
-- extensions is environment-agnostic and idempotent, so it lives here; the
-- schedule itself (cron.schedule + Vault secrets) stays per environment in
-- docs/runbooks/expire-reservations-cron.md, because a committed schedule
-- would fire on every preview branch.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
