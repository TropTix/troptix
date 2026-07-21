# Runbook: schedule the reservation-expiry sweep (Supabase cron)

Drives `POST /api/cron/expire-reservations`, which runs `sweepExpiredHolds` —
cancel-then-release expiry of held tickets ([ADR 0018](../adr/0018-paid-checkout-on-checkout-sessions.md)).
Scheduled with Supabase `pg_cron` + `pg_net` (the DB calls our HTTP endpoint;
the Stripe `sessions.expire` work can't run in SQL).

> **Apply per environment, by hand — not via `supabase/migrations`.** Each env
> (prod, dev) targets a different app URL + secret, and a committed migration
> would also schedule it on every per-PR preview branch, firing sweeps against
> the wrong URL. Run the SQL below against the **prod** database (and dev if you
> want it there).

## Prerequisites

1. Set `CRON_SECRET` in the app's environment (Vercel) to a strong random value.
2. Enable the extensions (Supabase Dashboard → Database → Extensions, or SQL):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

## Store the URL + secret in Vault

Keeps them out of the job definition (visible in `cron.job`).

```sql
select vault.create_secret('https://usetroptix.com', 'app_base_url');
select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');
```

## Schedule the sweep (every minute)

The hold is 12 min (`HOLD_TTL_MINUTES`), so once-a-minute release is plenty.

```sql
select cron.schedule(
  'expire-reservations',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url')
           || '/api/cron/expire-reservations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 10000
  );
  $$
);
```

## Verify

```sql
-- The job is registered:
select jobid, jobname, schedule, active from cron.job where jobname = 'expire-reservations';

-- Recent runs + HTTP status (pg_net logs responses):
select * from cron.job_run_details where jobname = 'expire-reservations' order by start_time desc limit 5;
select * from net._http_response order by created desc limit 5;
```

A healthy run returns `200` with `{ "success": true, "released": N, "keptLive": M }`.
A `401` means the `Bearer` token doesn't match `CRON_SECRET`.

## Change / remove

```sql
-- Reschedule: unschedule, then re-run cron.schedule above.
select cron.unschedule('expire-reservations');
```
