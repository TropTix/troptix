---
title: Shared DB+API Packages, Drizzle, Supabase Auth & Checkout Service Extraction
status: proposed
created: 2026-06-07
tracking-issue: TBD
---

# Platform Redesign: Shared Packages, Drizzle, Supabase Auth, tRPC

## Context

TropTix is between live events — **no traffic right now**. That is a rare safe window to do the invasive structural work that the existing docs deliberately deferred *because the system was live*. The goal of this initiative: simplify the checkout backend, finalize the database design, and extract a **shared, typed data-access + API layer** so every client (web, the Expo organizer app, future clients) consumes one source of truth instead of hand-mirroring types.

This builds directly on work already merged: the shared Stripe client (#279), the reservation schema foundation (#284, Phase A), and the `reserve`/`confirm`/`release`/`expire` primitives + tests (#285, B1). Per #286, the checkout *cutover* (B2–B4) was folded into an imminent checkout redesign — this plan **is** that redesign, plus the platform foundation it sits on. Backing decisions: [ADR 0008](../adr/0008-drizzle-orm.md), [ADR 0009](../adr/0009-shared-package-topology.md), [ADR 0010](../adr/0010-vitest-for-packages.md), [ADR 0011](../adr/0011-supabase-auth-identity.md). Schema changes ship through the Supabase migrations pipeline ([ADR 0004](../adr/0004-supabase-migrations-as-source.md)).

**Problems being solved (all verified in-repo):**
- **Type duplication** — `apps/web/src/types/checkout.ts` and `apps/organizer/hooks/types/Ticket.ts` hand-mirror each other and Prisma enums. No shared package.
- **No service layer** — Prisma is imported directly in 40+ files; `initiate/route.ts` is a 609-line monolith; logic is bound to HTTP routes and hard to unit-test.
- **Dual-era schema** — legacy columns (`quantity`/`quantitySold`, Float prices, split `startDate`/`startTime`, `AVAILABLE`/`NOT_AVAILABLE`) coexist with the additive Phase-A columns; renames/drops were deferred.
- **Auth identity is foreign** — `User.id` *is* the Firebase UID (`api/user/create/route.ts` does `users.create({ data: { id }})`), propagated as a FK everywhere. RLS is enabled (#283) but inert because the DB session has no `auth.uid()`.
- **Monorepo isn't wired** — root `package.json` `workspaces` lists only `apps/web` (+ a phantom `apps/server`); `apps/organizer`, `apps/backstage`, and `packages/*` are outside the graph.

## Locked decisions (the stack)

| Fork | Decision |
|---|---|
| **API layer** | Framework-agnostic **service layer** (`packages/api/services`, pure `(db, input) => result` fns) + a **thin tRPC adapter**. Stripe webhook + cron stay plain REST and call the *same* services. |
| **ORM** | **Drizzle** in `packages/db`. Drizzle replaces Prisma as the schema source + SQL generator on the existing ADR-0004 pipeline (plain SQL stays source of truth). |
| **DB scope** | **Full Priority-2 redesign now** — semantic changes *and* the rename/drop sweep. |
| **Auth** | **Firebase → Supabase Auth**, folded into the foundation stage. **Preserve accounts** (and Orders/Tickets — financial/attendance records). Identity: keep existing `User.id` **stable**, add `authUserId uuid @unique → auth.users(id)`; RLS keys off `auth.uid() = authUserId`. |
| **Sequencing** | Cutover folded into the checkout redesign (#286): B2 server wiring + new client ship as one atomic maintenance-window PR. |

**Assumption stated:** all data is preserved (Users, Events, Orders, Tickets). Migrations are written as real backfills with verification gates, not truncate-and-rebuild.

## The architectural seam (the whole point)

Dependency arrows point **one way only**. `services` never import tRPC, Next, Expo, or `next/headers` — that is what makes them unit-testable and lets the webhook/cron/server-components/tRPC all call the identical functions.

```
packages/db  ◄── packages/api/services  ◄── packages/api/trpc (router)
                          ▲                          ▲
   apps/web webhook(REST)+cron ─┘                    │
   apps/web server components ───── direct call ─────┤
   apps/web client components ──── tRPC react-query ─┤
   apps/organizer (Expo) ──────── tRPC react-query ──┘
```

**Two-entry packages = the RN-safety mechanism.** Server runtime (Drizzle client, `pg`, the router *value*) is quarantined behind `server-only` entries the Expo bundle never imports; clients import **`import type { AppRouter }`** (erased by Babel) + zod contract types only.

- `@troptix/db` → server (has `import 'server-only'`); `@troptix/db/types` → inferred row/enum types, zero runtime imports (RN-safe).
- `@troptix/api` → type-only barrel (`AppRouter` type + zod contracts); `@troptix/api/server` → `appRouter`, `createContext`, `createCaller`, services (server-only).

---

## Stages & sequencing

The data spine is inherently sequential (types flow downward); parallel seams are marked **∥**. Design-system / Priority-5 work runs alongside throughout.

### Stage 0 — Monorepo wiring *(small, unblocks everything)*
- Root `package.json` `workspaces` → `["apps/*", "packages/*"]`. Ensure the two empty `packages/troptix-*` have valid `package.json` or delete them.
- Add `tsconfig.base.json` with path aliases (`@troptix/db`, `@troptix/api`); each app/package `extends` it.
- **Ship TS source, no build step** — `main`/`types` point at `.ts`; consumers transpile (Next `transpilePackages` — `externalDir: true` already set; Expo/Metro via `watchFolders`).
- **No turbo yet** — plain `yarn workspaces foreach` for `typecheck`/`test`. Revisit at the 3rd consumer.
- **Validate immediately:** `yarn install` (watch React 19.2.1 vs organizer 19.0.0 / RN 0.79 hoist skew — `nohoist` the Expo toolchain if Metro complains); a `@troptix/db/types` import into the RN app is the canary.
- **Metro config** (`apps/organizer/metro.config.js`): `watchFolders = [workspaceRoot]`, `nodeModulesPaths` app→root, `unstable_enableSymlinks`.

### Stage 1 — Foundation: `packages/db` + schema redesign + Supabase Auth
Mostly sequential (migration ordering is load-bearing). Each migration = its own PR on a Supabase preview branch.

**1a. Drizzle baseline (re-baseline, don't introspect)**
- `packages/db/src/{schema,relations,enums,client,types}.ts`, `drizzle.config.ts` with `out: ../../supabase/migrations`.
- Author `schema.ts` to model the **current dual-era reality** (matches today's `schema.prisma`), then `drizzle-kit generate --custom` to write the **meta snapshot only** (tables already exist on every branch).
- **Empty-diff gate:** recreate a preview branch from the 3 existing SQL migrations; confirm `drizzle-kit generate` emits an empty diff. Non-empty ⇒ snapshot drifted from the hand-written SQL; fix `schema.ts` until empty. This preserves ADR-0004's "dev is derived-from-migrations" invariant.
- Replace the body of `apps/web/scripts/new-migration.ts` (`prisma migrate diff` → `drizzle-kit generate`), keeping the Supabase timestamp filename + "review then `yarn db:apply`" contract. `apply-migration.ts` (`supabase db push`) is unchanged. Prisma client stays live this stage (dual-ORM) until services port in Stage 2.
- `client.ts`: Drizzle over a `pg` Pool, same dev-global singleton pattern as `apps/web/src/server/prisma.ts`; reuse existing Supabase connection env vars. Export `DB`/`Tx` handle types; services type against `DB | Tx`.

**1b. Schema redesign migrations — order: backfill → constrain → drop → rename**
- **M4 backfill (data-only):** `Events.startsAt/endsAt` ← `startDate+startTime` (fixes the sale-window-ignores-time bug); `TicketTypes`: `saleStartsAt/saleEndsAt`, `capacity ← quantity`, `sold ← quantitySold`, `priceCents ← round(price*100)`; `Orders.*Cents`, `Orders.type`; `Tickets` status `AVAILABLE→VALID` / `NOT_AVAILABLE→CANCELLED`. **Verification queries must return 0 nulls before proceeding.**
- **M5 NOT NULL** on backfilled columns. **M6 CHECK** constraints: `reserved>=0 AND sold>=0 AND reserved+sold<=capacity` (the invariant `reserve` relies on), cents `>=0`.
- **M7 drop dead tables:** `Promotions`, `DelegatedUsers`, `SocialMediaAccounts` (+ enums). Grep-confirm no code refs first (`SocialMediaAccounts` is in the Users relation — remove it).
- **M8 drop legacy columns:** split dates, `quantity`/`quantitySold`, Float prices, redundant `name`.
- **M9 enum surgery (highest risk):** remove `AVAILABLE`/`NOT_AVAILABLE` via the create-new-enum / `ALTER COLUMN ... USING ::text::new` / drop-old / rename dance. Pre-flight `count(*) WHERE status IN (dead values)` = 0. **Isolate this migration.**
- **M10 column renames:** `discountCode→password`, `organizer→hostName`.
- **M11 table renames (last):** `Users→User`, `Events→Event`, `Orders→Order`, `TicketTypes→EventTicket`, `Tickets→OrderTicket` + explicit `RENAME CONSTRAINT`. Done last so prior migrations reference stable names. **`prisma generate` + `yarn typecheck` across the 40+ import sites is the cutover gate** (Prisma model names change with the tables). Empty-diff check after.
- **M12 mandatory timestamps** NOT NULL + defaults everywhere.

**1c. Supabase Auth migration (account-preserving, orphan-safe order)**
1. **Add column** `User.authUserId uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL` (nullable initially; slot before the rename sweep on `Users`).
2. **Import Firebase users → `auth.users`** (one-time script per env via Supabase Admin API, *not* a SQL migration): export via Firebase Admin `listUsers()`; import **preserving passwords** using GoTrue's `firebase_scrypt` algorithm + project signer key/salt/rounds/mem params (test a handful first — wrong params = silent login failure). Capture the `firebaseUid → new authUserId` map. **Stamp `app_metadata.troptix_user_id = User.id`** so the stable id rides in the JWT.
3. **Backfill** `User.authUserId` from the map. **Orphan gate:** `SELECT count(*) FROM "Users" WHERE "authUserId" IS NULL` must be 0 before any auth code flips.
4. **RLS policies** (hand-appended per #281, on final table names) keyed off `auth.uid() = authUserId` (join through stable `userId` for `Order`/`OrderTicket`/`Reservation`; through `Event.organizerUserId` for organizer-scoped tables). **App stays on the bypassrls connection this stage** — policies validated on preview branches but not yet load-bearing (going live is a later runtime change).
5. **Cut over verification** in `apps/web/src/server/authUser.ts` + `src/server/lib/auth.ts`: replace `firebase-admin verifyIdToken` with Supabase JWT verification; return shape stays `{ userId, email }` where `userId` = `app_metadata.troptix_user_id` (the stable `User.id`) so the 24 callsites are untouched. Switch cookie `fb-token` → Supabase session cookies (`@supabase/ssr`).
6. **Cut over issuance** (web auth UI + `api/user/create`) to Supabase `signInWithPassword`/`signUp`. Invariant going forward: `authUserId` is always the auth key, `id` is always the app PK — never assume equality.
7. **Dual-verify shim** in `authUser.ts` (try Supabase, fall back to Firebase) covers the **Expo cross-repo lag** until the organizer app ships Supabase tokens; remove shim + uninstall `firebase`/`firebase-admin` after.

### Stage 2 — `packages/api`: services + contracts + tRPC
- **`contracts/` (zod)** — port `apps/web/src/types/checkout.ts` (`ValidationResponse`, `CheckoutTicket`, `ApplyCodeResponse`, message enums) to zod schemas; one definition consumed by services (`.parse`), tRPC (`.input()`), and clients (`z.infer`). **This is the contract-freeze point that unlocks Stage 3 ∥ work.**
- **`services/`** — port `apps/web/src/server/lib/reservations.ts` near-mechanically (Prisma `$transaction` → `db.transaction`; race-safe `reserve` CTE stays raw SQL via Drizzle's `sql` tag against `"EventTicket"`; functions take `db` as first arg). Port `getCheckoutConfig` (from `config/route.ts`), `applyCode`, `events`, `organizer` reads, `_shared/fees`.
- **`trpc/`** — `initTRPC`, `publicProcedure`/`protectedProcedure` (auth middleware over `ctx.session`); `context.ts` builds `{ db, session }` from the request (Supabase JWT, Bearer for RN); `routers/{checkout,events,organizer}.ts` are thin pass-throughs. `confirm`/`expire` are **not** procedures — webhook/cron drive them.
- **Webhook + cron rewrite** — `src/pages/api/stripe/webhook.ts` stays REST (needs raw body for signature verify), rewritten to call `confirm(db, …)`; `cron/invalidate-orders` calls `expire(db, now)`. Supersedes `orderHelper`/`updateOrderAfterPaymentSucceeds`.

### Stage 3 — Clients *(∥ once contracts frozen)*
- **3a. Web checkout redesign** (first consumer; atomic cutover PR per #286): new reservation-aware checkout pages on `trpc.checkout.*` via `@trpc/react-query`; `/api/trpc/[trpc]/route.ts` App Router handler; server components call services directly or via `createCaller`. Replaces `useCheckout`/`useFetchCheckoutConfig`/`useApplyCode` and the old `CheckoutContainer`/`payment-form`.
- **3b. Organizer rewire** ∥: add `@trpc/client` + `@trpc/react-query`, drop axios; `lib/trpc.ts` with `import type { AppRouter }`; hooks → `trpc.events.*` / `trpc.organizer.*` with the Supabase token via the client `headers` callback. **Delete `apps/organizer/hooks/types/Ticket.ts`** (enums now from `@troptix/db/types`).
- **Delete** `apps/web/src/types/checkout.ts` (moved to `packages/api/contracts`).

---

## Testing strategy ("simple & testable")
- **Pure service unit tests** (Vitest, package-local) — inject a fake `db`; no HTTP/Next/tRPC harness. Covers `getCheckoutConfig` mapping/sorting, `applyCode` gating, fee calc, response shaping.
- **Reservation integration tests** — port the B1 `reservations.test.ts` (the 8-way concurrent "last ticket granted once" test) to `packages/api/services/reservations.test.ts` against a Supabase **preview-branch** Postgres (concurrency/locking can't be mocked).
- **Runner:** Vitest for `packages/*` (native ESM/TS, the tests you write most); Jest stays for `apps/web` components. Root `yarn test` fans out via `workspaces foreach`. Rewrite `jest.config.ts` `projects` (drop phantom `server`). See [ADR 0010](../adr/0010-vitest-for-packages.md).
- **Lint guardrail:** ESLint `no-restricted-imports` banning `@troptix/api/server` + `@troptix/db` from `apps/organizer`.

## Verification (end-to-end)
- **Per migration PR:** Supabase Branching preview DB; after apply, `yarn db:new` emits **no diff** (snapshot ↔ DB consistent); backfill verification queries return 0 nulls.
- **Rename gate:** `prisma generate` + `yarn typecheck` green across all import sites after M11.
- **Auth:** import test users to a preview DB, verify password-preserving sign-in (web + a simulated Supabase Bearer token for RN), verify an organizer read still resolves by stable `User.id`; orphan-gate null-count = 0.
- **Checkout E2E:** Stripe CLI `stripe listen --forward-to localhost:<port>/api/stripe/webhook` + `stripe trigger payment_intent.succeeded` → reservation→order, one email, `sold` incremented; replay → no double-count; two concurrent `reserve` on `capacity:1` → exactly one grant.
- Keep the Firebase project read-available until the dual-verify shim is removed (rollback).

## Risks
- **Drizzle baseline drift** → empty-diff gate against a fresh-from-migrations branch.
- **Enum drop (M9)** hard-fails if any row holds a dead value → backfill + pre-flight count gate; isolate the migration.
- **Password import fidelity** → test a handful before bulk; wrong scrypt params fail silently.
- **`authUserId` vs stable `id` confusion** across 24 auth callsites → stamp `troptix_user_id` in JWT; assert return shape in a test.
- **Expo cross-repo lag** → dual-verify shim until organizer ships Supabase tokens.
- **Metro bundling server code** → type-only barrel + `server-only` + lint rule; validate `@troptix/db/types` import early.
- **Workspace re-hoist** React/RN skew → `nohoist` Expo toolchain; single hoisted TS version via `resolutions`.

## Out of scope
- Going *live* on RLS (app stays bypassrls; flipping the runtime connection to `authenticated` is a later hardening step once policies are proven).
- Full transactional email service (minimal outbox only, already present).
- Stripe Connect; `apps/backstage` build-out; turbo adoption.

## Execution
Implementation PRs reference the umbrella tracking issue (TBD) and the stage above. The four backing ADRs (0008–0011) ship with this plan for review; they move to **Accepted** when this plan is approved and flipped to `active`.
