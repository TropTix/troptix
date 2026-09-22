# TropTix web

The Next.js app for TropTix: public event pages, checkout, attendee orders, and the organizer dashboard. It is one member of the root pnpm workspace and imports the shared packages under `packages/`.

## Stack

- Next.js 16 App Router, React 19, TypeScript
- Tailwind v4 with shadcn/ui and Radix ([ADR 0001](../../docs/adr/0001-tailwind-v4-first.md))
- tRPC 11 over `@troptix/api`, with TanStack Query on the client
- Prisma 7 through `@troptix/db` ([ADR 0012](../../docs/adr/0012-prisma-7-instead-of-drizzle.md))
- Supabase for auth, Postgres, and storage ([ADR 0011](../../docs/adr/0011-supabase-auth-identity.md), [ADR 0016](../../docs/adr/0016-supabase-storage-for-event-images.md))
- Stripe Checkout Sessions for paid orders ([ADR 0018](../../docs/adr/0018-paid-checkout-on-checkout-sessions.md))
- Resend and React Email through `@troptix/transactional` ([ADR 0017](../../docs/adr/0017-transactional-email-package.md))
- PostHog for analytics and release flags ([ADR 0023](../../docs/adr/0023-release-gating-via-posthog-flags.md))
- Deployed on Vercel

## Getting started

Node 24 and pnpm 11 (pinned in the root `packageManager` field; enable it with Corepack). Always use pnpm, never npm or yarn.

```bash
corepack enable
pnpm install            # at the repo root
cd apps/web             # add the variables below to .env
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). `pnpm dev` at the repo root does the same thing.

There is no local database. Point the app at the persistent Supabase dev branch for app work, or at a per-PR preview branch for schema work. See [Environments](../../docs/plans/2026-06-migrations-adoption.md#environments--which-db-to-use-when) and [ADR 0006](../../docs/adr/0006-hosted-branching-persistent-dev-branch.md).

### Environment variables

Next.js reads `.env` and `.env.local` in this directory. Both are gitignored.

| Variable                                                            | Purpose                                                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`                   | Pooled and direct Postgres URLs. The Supabase↔Vercel integration sets them. |
| `PG_POOL_MAX`                                                       | Optional cap on the Prisma pg pool size.                                    |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  | Supabase auth and storage client.                                           |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`           | Stripe server and browser keys.                                             |
| `STRIPE_RESERVATION_WEBHOOK_SECRET`                                 | Signing secret for `/api/stripe/reservation-webhook`.                       |
| `RESEND_API_KEY`                                                    | Transactional email.                                                        |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`               | PostHog. Requests proxy through `/ingest` (see `next.config.js`).           |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Venue autocomplete and maps.                                                |
| `CRON_SECRET`                                                       | Bearer token for `/api/cron/*`. The route fails closed when unset.          |
| `NEXT_PUBLIC_APP_URL`                                               | Public origin override. Falls back to the Vercel URL variables.             |

## Scripts

Run these from `apps/web`, or from the root with `pnpm --filter web <script>`.

| Script            | What it does                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`        | Start the dev server.                                                                                                 |
| `pnpm dev:mobile` | Start the dev server behind an ngrok tunnel and print a QR code, for testing on a phone.                              |
| `pnpm build`      | Regenerate the Prisma client, then `next build`.                                                                      |
| `pnpm typecheck`  | `tsc --noEmit`. The root `pnpm typecheck` runs this for every workspace package.                                      |
| `pnpm lint`       | ESLint.                                                                                                               |
| `pnpm test`       | Jest with jsdom. `pnpm test:watch` for watch mode.                                                                    |
| `pnpm knip`       | Report unused files, exports, and dependencies.                                                                       |
| `pnpm db:new`     | Write a new SQL migration by diffing `schema.prisma` against the base ref. See [Database changes](#database-changes). |
| `pnpm db:apply`   | Push pending migrations to the database in `POSTGRES_URL_NON_POOLING`.                                                |

Prettier formats every commit through the husky pre-commit hook. Run `pnpm format` at the root if you touched many files.

## Layout

```
src/
  app/            App Router routes
    e/[eventId]   public event page (legacy /events/:id redirects here)
    o/[slug]      organizer public page
    discover      event listing
    orders        attendee orders and tickets
    organizer     organizer dashboard: events, payouts, profile, platform admin
    auth          passwordless sign-in, callback, sign-out
    api           tRPC handler, Stripe webhook, cron, and deprecated REST routes for the old organizer app
  components/     shared UI; components/ui holds shadcn primitives
  hooks/
  lib/            client-safe helpers, zod schemas, Supabase clients
  server/         server-only helpers: Prisma client, auth user, Stripe, email, feature flags
  proxy.ts        Next.js proxy: refreshes the Supabase session and redirects unauthenticated users off protected routes
scripts/          dev-mobile, new-migration, apply-migration
```

Business logic lives in `@troptix/api` services, not in routes ([ADR 0013](../../docs/adr/0013-authorization-in-the-service-layer.md)). Routes and server actions build a context and call a service.

## Database changes

Schema changes go through `supabase/migrations`, not `prisma db push`. The full flow is in [docs/plans/2026-06-migrations-adoption.md](../../docs/plans/2026-06-migrations-adoption.md).

1. Edit `packages/db/prisma/schema.prisma`.
2. `pnpm db:new <name>` writes `supabase/migrations/<timestamp>_<name>.sql`. Review the SQL.
3. `pnpm db:apply` pushes it to your preview branch.
4. Update `supabase/seed.sql` so fresh preview branches have rows for the new columns.
5. Merge. Supabase Branching applies the migration to production.

A second migration on the same branch needs `--base=<commit that added the first>` or `MIGRATION_BASE_REF`, or `db:new` re-emits the first one.

## Dates and times

Event times are venue-local and render through the shared formatter. Operational timestamps render through `<LocalTime>`. Never call `format()` or `toLocale*` on an event date in a Server Component. See [ADR 0021](../../docs/adr/0021-event-times-are-venue-local.md) and the root `CLAUDE.md`.

## Background jobs

`POST /api/cron/expire-reservations` releases expired ticket holds. A Supabase `pg_cron` job calls it with the `CRON_SECRET` bearer token. Setup and checks are in [docs/runbooks/expire-reservations-cron.md](../../docs/runbooks/expire-reservations-cron.md).

## More

- [docs/](../../docs) for the roadmap, ADRs, plans, and runbooks
- [docs/runbooks/feature-flags.md](../../docs/runbooks/feature-flags.md) for gating unfinished work behind PostHog flags
