---
title: Shared DB+API Packages, Prisma 7, Supabase Auth & Checkout Service Extraction
status: proposed
created: 2026-06-07
tracking-issue: TBD
---

# Platform Redesign: Shared Packages, Prisma 7, Supabase Auth, tRPC

## Context

TropTix is between live events — **no traffic right now**. That is a rare safe window to do the invasive structural work that the existing docs deliberately deferred _because the system was live_. The goal of this initiative: simplify the checkout backend, finalize the database design, and extract a **shared, typed data-access + API layer** so every client (web, the Expo organizer app, future clients) consumes one source of truth instead of hand-mirroring types.

This builds directly on work already merged: the shared Stripe client (#279), the reservation schema foundation (#284, Phase A), and the `reserve`/`confirm`/`release`/`expire` primitives + tests (#285, B1). Per #286, the checkout _cutover_ (B2–B4) was folded into an imminent checkout redesign — this plan **is** that redesign, plus the platform foundation it sits on. Backing decisions: [ADR 0012](../adr/0012-prisma-7-instead-of-drizzle.md) (Prisma 7, supersedes the Drizzle ADR 0008), [ADR 0009](../adr/0009-shared-package-topology.md), [ADR 0010](../adr/0010-vitest-for-packages.md), [ADR 0011](../adr/0011-supabase-auth-identity.md). Schema changes ship through the Supabase migrations pipeline ([ADR 0004](../adr/0004-supabase-migrations-as-source.md)).

**Problems being solved (all verified in-repo):**

- **Type duplication** — `apps/web/src/types/checkout.ts` and `apps/organizer/hooks/types/Ticket.ts` hand-mirror each other and Prisma enums. No shared package.
- **No service layer** — Prisma is imported directly in 40+ files; `initiate/route.ts` is a 609-line monolith; logic is bound to HTTP routes and hard to unit-test.
- **Dual-era schema** — legacy columns (`quantity`/`quantitySold`, Float prices, split `startDate`/`startTime`, `AVAILABLE`/`NOT_AVAILABLE`) coexist with the additive Phase-A columns; renames/drops were deferred.
- **Auth identity is foreign** — `User.id` _is_ the Firebase UID (`api/user/create/route.ts` does `users.create({ data: { id }})`), propagated as a FK everywhere. RLS is enabled (#283) but inert because the DB session has no `auth.uid()`.
- **Monorepo isn't wired** — root `package.json` `workspaces` lists only `apps/web` (+ a phantom `apps/server`); `apps/organizer`, `apps/backstage`, and `packages/*` are outside the graph.

## Locked decisions (the stack)

| Fork           | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **API layer**  | Framework-agnostic **service layer** (`packages/api/services`, pure `(db, input) => result` fns) + a **thin tRPC adapter**. Stripe webhook + cron stay plain REST and call the _same_ services.                                                                                                                                                                                                                                                                                                                                                  |
| **ORM**        | ~~Drizzle~~ → **Prisma 7** (Rust-free `prisma-client` + `@prisma/adapter-pg`) in `packages/db`, on the existing ADR-0004 pipeline (plain SQL stays source of truth). Reversed per [ADR 0012](../adr/0012-prisma-7-instead-of-drizzle.md) (supersedes 0008): under the tRPC + `server-only` topology the RN app never bundles the DB client, so Prisma's engine was never the blocker — and Prisma 7 is engine-free. Avoids porting 40+ call sites + the tested reservation primitives. See [Prisma 7 upgrade plan](2026-06-prisma-7-upgrade.md). |
| **DB scope**   | **Full Priority-2 redesign now** — semantic changes _and_ the rename/drop sweep.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Auth**       | **Firebase → Supabase Auth**, folded into the foundation stage. **Preserve accounts** (and Orders/Tickets — financial/attendance records). Identity: keep existing `User.id` **stable**, add `authUserId uuid @unique → auth.users(id)`; RLS keys off `auth.uid() = authUserId`.                                                                                                                                                                                                                                                                 |
| **Sequencing** | Cutover folded into the checkout redesign (#286): B2 server wiring + new client ship as one atomic maintenance-window PR.                                                                                                                                                                                                                                                                                                                                                                                                                        |

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

**Two-entry packages = the RN-safety mechanism.** Server runtime (the Prisma 7 client, `pg`, the router _value_) is quarantined behind `server-only` entries the Expo bundle never imports; clients import **`import type { AppRouter }`** (erased by Babel) + zod contract types only.

- `@troptix/db` → server (has `import 'server-only'`); `@troptix/db/types` → inferred row/enum types, zero runtime imports (RN-safe).
- `@troptix/api` → type-only barrel (`AppRouter` type + zod contracts); `@troptix/api/server` → `appRouter`, `createContext`, `createCaller`, services (server-only).

---

## Stages & sequencing

The data spine is inherently sequential (types flow downward); parallel seams are marked **∥**. Design-system / Priority-5 work runs alongside throughout.

### Stage 0 — Monorepo wiring _(small, unblocks everything)_

- Root `package.json` `workspaces` → `["apps/*", "packages/*"]`. Ensure the two empty `packages/troptix-*` have valid `package.json` or delete them.
- Add `tsconfig.base.json` with path aliases (`@troptix/db`, `@troptix/api`); each app/package `extends` it.
- **Ship TS source, no build step** — `main`/`types` point at `.ts`; consumers transpile (Next `transpilePackages` — `externalDir: true` already set; Expo/Metro via `watchFolders`).
- **No turbo yet** — plain `yarn workspaces foreach` for `typecheck`/`test`. Revisit at the 3rd consumer.
- **Validate immediately:** `yarn install` (watch React 19.2.1 vs organizer 19.0.0 / RN 0.79 hoist skew — `nohoist` the Expo toolchain if Metro complains); a `@troptix/db/types` import into the RN app is the canary.
- **Metro config** (`apps/organizer/metro.config.js`): `watchFolders = [workspaceRoot]`, `nodeModulesPaths` app→root, `unstable_enableSymlinks`.

### Stage 1 — Foundation: `packages/db` + schema redesign + Supabase Auth

Mostly sequential (migration ordering is load-bearing). Each migration = its own PR on a Supabase preview branch.

**1a. Prisma 7 upgrade + relocation into `packages/db`** _(replaces the former Drizzle baseline — [ADR 0012](../adr/0012-prisma-7-instead-of-drizzle.md))_

- Upgrade Prisma **5.22 → 7** (Rust-free `prisma-client` generator + `@prisma/adapter-pg`); then move the schema + generated client into `packages/db`. Full breakdown + the two PRs (upgrade-in-place → relocate) in the [Prisma 7 upgrade plan](2026-06-prisma-7-upgrade.md).
- `packages/db/src/{index,types}.ts`: server entry exports the `prisma` singleton (`server-only`) + `DB`/`Tx` handle types; `./types` re-exports model/enum types (RN-safe). `prisma.config.ts` holds the datasource (ADR-0004 pipeline kept; `prisma migrate diff` flags updated for v7).
- `new-migration.ts` keeps the Supabase timestamp filename + "review then `yarn db:apply`" contract; `apply-migration.ts` (`supabase db push`) is unchanged. No dual-ORM — Prisma is the single ORM throughout.

**1b. Schema redesign migrations — order: backfill → constrain → drop → rename**

> **Sequencing reality (verified 2026-06-09).** Most of 1b is **gated on Stage 2/3**, not doable before them. The live app is still heavily coupled to the legacy schema — `quantity`/`quantitySold` (34 refs), split dates (108), Float money (88), `AVAILABLE`/`NOT_AVAILABLE` (22), legacy model names (82) — and the reservation cutover that moves it onto the new columns was deferred into Stage 2 (services) + Stage 3 (checkout redesign). So: the **backfill (M4) goes stale immediately** (the app writes only the old columns) and belongs at the Stage-3 cutover; **NOT NULL (M5) is gated** (the app doesn't populate the new columns); **CHECK (M6) is mostly inert** now (`capacity` is NULL everywhere). The **only safe, independent piece now is dropping genuinely-dead tables** — done in the cleanup PR (see below). M8–M12 (drop legacy columns, enum surgery, renames) land **after** Stage 2/3 retire the app's use of the legacy schema.

- **M4 backfill (data-only):** `Events.startsAt/endsAt` ← `startDate+startTime` (fixes the sale-window-ignores-time bug); `TicketTypes`: `saleStartsAt/saleEndsAt`, `capacity ← quantity`, `sold ← quantitySold`, `priceCents ← round(price*100)`; `Orders.*Cents`, `Orders.type`; `Tickets` status `AVAILABLE→VALID` / `NOT_AVAILABLE→CANCELLED`. **Verification queries must return 0 nulls before proceeding.** _(Deferred to the Stage-3 cutover — backfilling earlier goes stale.)_
- **M5 NOT NULL** on backfilled columns. **M6 CHECK** constraints: `reserved>=0 AND sold>=0 AND reserved+sold<=capacity` (the invariant `reserve` relies on), cents `>=0`. _(Gated — needs the app writing the new columns.)_
- **M7 drop dead tables — DONE (cleanup PR):** dropped `Promotions` + `DelegatedUsers` (+ `PromotionType`/`DelegatedAccess` enums + dead helper files) — both were dead code (helpers defined but never called, zero CRUD). **`SocialMediaAccounts` is NOT dead** — `pages/api/users` upserts it — so it is **kept**, correcting this plan's earlier note.
- **M8 drop legacy columns:** split dates, `quantity`/`quantitySold`, Float prices, redundant `name`.
- **M9 enum surgery (highest risk):** remove `AVAILABLE`/`NOT_AVAILABLE` via the create-new-enum / `ALTER COLUMN ... USING ::text::new` / drop-old / rename dance. Pre-flight `count(*) WHERE status IN (dead values)` = 0. **Isolate this migration.**
- **M10 column renames:** `discountCode→password`, `organizer→hostName`.
- **M11 table renames (last):** `Users→User`, `Events→Event`, `Orders→Order`, `TicketTypes→EventTicket`, `Tickets→OrderTicket` + explicit `RENAME CONSTRAINT`. Done last so prior migrations reference stable names. **`prisma generate` + `yarn typecheck` across the 40+ import sites is the cutover gate** (Prisma model names change with the tables). Empty-diff check after.
- **M12 mandatory timestamps** NOT NULL + defaults everywhere.
- **M13 id standardization ([ADR 0014](../adr/0014-uuidv7-pks-and-public-codes.md)):** PKs → **UUIDv7** (native `uuid`), and add unique, type-prefixed **`publicCode`** columns (`O…`/`T…`/`E…`/`ET…`/`R…`) for user-facing ids. Heavy — re-keys every PK + all ~80 FK columns + reconciles today's mixed uuid/short-code rows; coordinated with the app cutover. `generateId()` switches to UUIDv7; a `generatePublicCode(prefix)` util is added. **Gated on the app cutover (Stage 2/3)** like M8–M11.

**1c. Supabase Auth migration (passwordless, orphan-safe order)**

> **Revised 2026-06-10 → [ADR 0015](../adr/0015-passwordless-auth-and-trigger-provisioning.md).** No password migration: of 35 users who logged in last year only 12 used a password, and the `firebase_scrypt` import is the riskiest, silent-failure-prone step. Auth goes **passwordless** (email OTP/magic-link + Google/Apple OAuth); existing accounts are claimed by verified email (Supabase auto-links OAuth identities to a confirmed-email account). The decoupled-identity decision from [ADR 0011](../adr/0011-supabase-auth-identity.md) is unchanged.

1. **Add column** `Users.authUserId uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL` (nullable; slot before the rename sweep on `Users`). _(Done — PR 1c-1.)_
2. **Provisioning trigger** `handle_new_auth_user` (`AFTER INSERT ON auth.users`, **link-or-create** by email): links an existing app user by email, else inserts a fresh `Users` row with an app-generated `id` (never the auth uid) — see ADR 0015 for the trigger-vs-code rationale (OAuth/magic-link create the auth row out of band, so app code can't provision without an orphan window). Kept deliberately minimal — referential glue, not business logic. _(PR 1c-2.)_
3. **Import Firebase users → `auth.users`** (one-time script per env, _not_ a SQL migration): export via Firebase Admin `listUsers()`; insert `auth.users` rows with `email`, `email_confirmed_at` set (so OAuth auto-linking is allowed), and `app_metadata.troptix_user_id = Users.id`. **No password hashes.** The provisioning trigger (step 2) auto-links each row to its existing `Users` by email — **this doubles as the backfill, so no separate backfill script.** **Orphan gate:** `SELECT count(*) FROM "Users" WHERE "authUserId" IS NULL` must be 0 before any auth code flips.
4. **RLS policies** (hand-appended per #281, on final table names) keyed off `auth.uid() = authUserId` (join through stable `userId` for `Order`/`OrderTicket`/`Reservation`; through `Event.organizerUserId` for organizer-scoped tables). **App stays on the bypassrls connection this stage** — policies validated on preview branches but not yet load-bearing (going live is a later runtime change).
5. **Cut over verification** in `apps/web/src/server/authUser.ts` + `src/server/lib/auth.ts`: replace `firebase-admin verifyIdToken` with Supabase JWT verification; resolve the actor by `authUserId` (one indexed lookup — or read `app_metadata.troptix_user_id` from the JWT once a Custom Access Token hook stamps it). Return shape stays `{ userId, email }` where `userId` = the stable `Users.id`, so the ~24 callsites are untouched. Switch cookie `fb-token` → Supabase session cookies (`@supabase/ssr`).
6. **Cut over issuance** (web auth UI) to Supabase **passwordless** (`signInWithOtp`) + OAuth (`signInWithOAuth`). `api/user/create` is **removed** — the trigger provisions the `Users` row now. (An optional "set a password" in account settings via `auth.updateUser` is a later add, not a migration.) Invariant: `authUserId` is the auth key, `id` is the app PK — never assume equality, including for new users.
7. **Dual-verify shim** in `authUser.ts` (try Supabase, fall back to Firebase) covers the **Expo cross-repo lag** until the organizer app ships Supabase tokens; remove shim + uninstall `firebase`/`firebase-admin` after.

### Stage 2 — `packages/api`: services + contracts + tRPC

> **Detailed plan:** [API service-layer plan](2026-06-api-service-layer.md). Start with **PR 2a — the reservation services** (already written + tested, #285): move `reservations.ts` into `services/` with a `prisma`-first signature + Vitest on a preview branch, in isolation. Then contracts + read services (2b), then the tRPC adapter + webhook/cron rewire (2c). Server callers (webhook/cron/server components) call services **directly** — tRPC is only the transport for web's client components + RN, so the client migration waits for Stage 3.
>
> **Authorization** is enforced **in the services** via an explicit `actor` arg ([ADR 0013](../adr/0013-authorization-in-the-service-layer.md)) — defined now so services are authz-aware from day one. The full role × access model (scanner/promoter scopes, platform admin — currently unimplemented after the dead-code cleanup) is a **product decision deferred to a follow-up ADR alongside Stage 1c**, not a blocker here.

- **`contracts/` (zod)** — port `apps/web/src/types/checkout.ts` (`ValidationResponse`, `CheckoutTicket`, `ApplyCodeResponse`, message enums) to zod schemas; one definition consumed by services (`.parse`), tRPC (`.input()`), and clients (`z.infer`). **This is the contract-freeze point that unlocks Stage 3 ∥ work.**
- **`services/`** — move `apps/web/src/server/lib/reservations.ts` near-as-is (it's already Prisma `$transaction`; the race-safe `reserve` conditional `UPDATE` stays raw SQL via `$queryRaw`); refactor each fn to take the `prisma`/`tx` handle as its first arg so services are injectable/unit-testable. Port `getCheckoutConfig` (from `config/route.ts`), `applyCode`, `events`, `organizer` reads, `_shared/fees`. (Keeping Prisma per ADR 0012 makes this a move + signature change, not an ORM rewrite.)
- **`trpc/`** — `initTRPC`, `publicProcedure`/`protectedProcedure` (auth middleware over `ctx.session`); `context.ts` builds `{ db, session }` from the request (Supabase JWT, Bearer for RN); `routers/{checkout,events,organizer}.ts` are thin pass-throughs. `confirm`/`expire` are **not** procedures — webhook/cron drive them.
- **Webhook + cron rewrite** — `src/pages/api/stripe/webhook.ts` stays REST (needs raw body for signature verify), rewritten to call `confirm(db, …)`; `cron/invalidate-orders` calls `expire(db, now)`. Supersedes `orderHelper`/`updateOrderAfterPaymentSucceeds`.

### Stage 3 — Clients _(∥ once contracts frozen)_

> **Execution plan: [Stage 3 — Checkout Cutover](2026-06-stage-3-checkout-cutover.md)** (2026-06-12) — covers 3a plus the gated 1b migrations (M4–M13). 3b (organizer rewire) is deferred to the mobile rebuild.

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
- **Auth (passwordless — [ADR 0015](../adr/0015-passwordless-auth-and-trigger-provisioning.md)):** on a preview DB — (a) creating the `auth.users` trigger applies cleanly; (b) magic-link/OTP sign-in + Google OAuth each resolve to the right `Users` row; (c) inserting an `auth.users` row whose email matches an existing `Users` links it (no duplicate) and a brand-new email creates exactly one row; (d) an organizer read still resolves by stable `Users.id`; (e) orphan-gate null-count = 0.
- **Checkout E2E:** Stripe CLI `stripe listen --forward-to localhost:<port>/api/stripe/webhook` + `stripe trigger payment_intent.succeeded` → reservation→order, one email, `sold` incremented; replay → no double-count; two concurrent `reserve` on `capacity:1` → exactly one grant.
- Keep the Firebase project read-available until the dual-verify shim is removed (rollback).

## Risks

- **Prisma 7 upgrade surface** (ESM, new `prisma-client` generator + `output`, `pg` driver adapter, Supabase SSL/pool, `migrate diff` flag renames) → upgrade isolated in its own PR with a runtime smoke check before the package move; see the [Prisma 7 upgrade plan](2026-06-prisma-7-upgrade.md).
- **Enum drop (M9)** hard-fails if any row holds a dead value → backfill + pre-flight count gate; isolate the migration.
- **Passwordless ([ADR 0015](../adr/0015-passwordless-auth-and-trigger-provisioning.md))** — email deliverability becomes a hard login dependency (no password fallback): harden SPF/DKIM/DMARC + sending domain before cutover. The provisioning trigger throwing **blocks signup** → keep it minimal, test on a preview branch; creating a trigger on `auth.users` may be restricted on some tiers → verify there.
- **`authUserId` vs stable `id` confusion** across 24 auth callsites → stamp `troptix_user_id` in JWT; assert return shape in a test.
- **Expo cross-repo lag** → dual-verify shim until organizer ships Supabase tokens.
- **Metro bundling server code** → type-only barrel + `server-only` + lint rule; validate `@troptix/db/types` import early.
- **Workspace re-hoist** React/RN skew → `nohoist` Expo toolchain; single hoisted TS version via `resolutions`.

## Out of scope

- Going _live_ on RLS (app stays bypassrls; flipping the runtime connection to `authenticated` is a later hardening step once policies are proven).
- Full transactional email service (minimal outbox only, already present).
- Stripe Connect; `apps/backstage` build-out; turbo adoption.

## Execution

Implementation PRs reference the umbrella tracking issue (TBD) and the stage above. The four backing ADRs (0008–0011) ship with this plan for review; they move to **Accepted** when this plan is approved and flipped to `active`.
