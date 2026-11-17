# Runbook: schedule the email dispatcher (Supabase cron)

Drives `POST /api/cron/dispatch-email`, which sends due rows in the `Email`
table: retries, and any email whose `after()` send never ran
([ADR 0039](../adr/0039-email-outbox.md)).

> **Apply per environment, by hand — not via `supabase/migrations`**, for the
> same reason as [the expiry sweep](expire-reservations-cron.md): a migration
> would schedule it on every preview branch against the wrong URL. Preview
> deploys still send through `after()`; they just get no retries.

## Prerequisites

The expiry sweep's setup covers everything: `CRON_SECRET` in Vercel, the
`pg_cron` and `pg_net` extensions, and the `app_base_url` and `cron_secret`
Vault secrets. Do that first if this database doesn't have them.

## Schedule (every minute)

```sql
select cron.schedule(
  'dispatch-email',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url')
           || '/api/cron/dispatch-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);
```

## Verify

```sql
select jobid, jobname, schedule, active from cron.job where jobname = 'dispatch-email';
select * from cron.job_run_details where jobname = 'dispatch-email' order by start_time desc limit 5;
select * from net._http_response order by created desc limit 5;

-- Emails waiting, and why:
select status, count(*), min("nextAttemptAt") from "Email"
where status in ('PENDING', 'SENDING') group by status;
select id, type, attempts, "lastError" from "Email"
where status = 'FAILED' order by "createdAt" desc limit 20;
```

A healthy run returns `200` with `{ "success": true }`. A `401` means the
`Bearer` token doesn't match `CRON_SECRET`.

## Retry a failed email

A row in `FAILED` used up its attempts. Once the cause is fixed:

```sql
update "Email" set status = 'PENDING', attempts = 0, "nextAttemptAt" = now()
where id = '<id>';
```

The next run sends it. Resend's idempotency key blocks a second copy only for
24 hours after the first try.

## Change / remove

```sql
select cron.unschedule('dispatch-email');
```
