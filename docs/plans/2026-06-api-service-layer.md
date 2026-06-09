---
title: API Service Layer — @troptix/api (services + contracts + tRPC)
status: proposed
created: 2026-06-09
tracking-issue: TBD
---

# API Service Layer — `@troptix/api`

Stage 2 of the [platform redesign](2026-06-shared-packages-platform.md). Fills the `@troptix/api` skeleton with the **service layer** (pure functions over the Prisma handle), the **zod contracts**, and a **thin tRPC adapter**. Backing decisions: [ADR 0009](../adr/0009-shared-package-topology.md) (two-package topology), [ADR 0010](../adr/0010-vitest-for-packages.md) (Vitest), [ADR 0012](../adr/0012-prisma-7-instead-of-drizzle.md) (Prisma), [ADR 0013](../adr/0013-authorization-in-the-service-layer.md) (authz in services).

## Why this unblocks everything

The service layer is what **moves the app off the legacy schema** — services are written against the new columns (`capacity`/`sold`/`*Cents`/`startsAt`), and once the app calls them (Stage 3 cutover), the legacy columns/enums/renames (the deferred half of the schema redesign, M4–M12) become safe to drop. It also removes the type duplication and the 609-line `initiate` monolith.

## The seam (one-way; never violated)

```
@troptix/db  ◄── services  ◄── trpc router
                   ▲                ▲
   webhook(REST)+cron ─┘            │
   server components ─── direct ────┤
   web client comps ─── tRPC RQ ────┤
   apps/organizer (RN) ── tRPC RQ ──┘   (later — RN is being rebuilt)
```

`services` import **only** `@troptix/db` + zod — never tRPC/Next/Expo. That is what lets all four transports call the identical functions.

## What moves where (verified in-repo)

| Today (`apps/web`)                                                    | LOC | →                                            |
| --------------------------------------------------------------------- | --- | -------------------------------------------- |
| `types/checkout.ts` (7 types/enums)                                   | 76  | `contracts/` (zod)                           |
| `server/lib/reservations.ts` — `reserve`/`confirm`/`release`/`expire` | 342 | `services/reservations.ts`                   |
| `api/checkout/config/route.ts`                                        | 150 | `services/checkout.ts` → `getCheckoutConfig` |
| `api/checkout/apply-code/route.ts`                                    | 149 | `services/checkout.ts` → `applyCode`         |
| `api/checkout/initiate/route.ts` (monolith)                           | 608 | thin route → `services`                      |
| `lib/fees.ts`                                                         | —   | `services/_shared/fees`                      |

## Target structure

```
packages/api/src/
  contracts/       zod schemas — one definition for services (.parse), tRPC (.input), clients (z.infer)
  services/        pure (prisma, [actor,] input) => result   — the core
    reservations.ts  reserve / confirm / release / expire
    checkout.ts      getCheckoutConfig / applyCode
    _shared/fees.ts
  trpc/            initTRPC, context {db, session, actor}, procedure tiers, routers/*
  index.ts         type-only barrel (AppRouter type + contract types)   [RN-safe]
  server.ts        appRouter value, createCaller, services               [server entry]
```

## "Only web is ready" → start with a vertical slice, server-first

Most of the value needs **no tRPC**: server components, the webhook, and the cron call services **directly**. tRPC is only the transport for **client components** (web checkout UI) and **RN later**. So build services first; the client-side react-query migration waits for Stage 3 / RN.

### PR 2a — package skeleton + reservation services _(start here)_

The reservation primitives are already written **and tested** (#285) — highest-confidence first move; it establishes the package shape + the Vitest harness.

- Scaffold `services/`, `contracts/`, Vitest config (ADR 0010).
- Move `reservations.ts` → `services/reservations.ts`; each fn takes `prisma`/`tx` as the first arg. The `reserve` race-safe conditional `UPDATE` stays raw SQL (`$queryRaw`). **Actor-agnostic** — no authz needed (keys off reservation / payment-intent ids).
- Port the B1 `reservations.test.ts` → Vitest, run against a Supabase **preview branch** (the 8-way concurrent "last ticket granted once" test can't be mocked).
- **Not wired into the live app** — proven in isolation; zero runtime risk to web.

### PR 2b — contracts + read services

- `contracts/` — zod port of `types/checkout.ts` (`ValidationResponse`, `CheckoutTicket`, `ApplyCodeResponse`, message enums). **The contract-freeze point** that unblocks Stage 3.
- `services/checkout.ts` — `getCheckoutConfig`, `applyCode` on the **new** columns; injected-fake-`prisma` unit tests (no Postgres).
- `_shared/fees` from `lib/fees.ts`.

### PR 2c — tRPC adapter + server-caller rewire

- `trpc/` — `initTRPC`, `context.ts` builds `{ db, session, actor }`, procedure tiers (`public`/`protected`/`organizer`), `routers/{checkout,events,organizer}.ts` thin pass-throughs. `confirm`/`expire` are **not** procedures (webhook/cron drive them).
- `app/api/trpc/[trpc]/route.ts` App Router handler.
- Webhook (`pages/api/stripe/webhook.ts`, stays REST for raw-body signature verify) → `confirm(prisma, …)`; `cron/invalidate-orders` → `expire(prisma, now)`. Supersedes `orderHelper`/`updateOrderAfterPaymentSucceeds`.

### Then → Stage 3

Web client components move to `trpc.checkout.*` via `@trpc/react-query` (the checkout redesign); the legacy schema drops (M4–M12) land with that cutover; RN joins when rebuilt.

## Authorization (the seam — [ADR 0013](../adr/0013-authorization-in-the-service-layer.md))

Authz is enforced **in the services**, not the routes, via an explicit `actor` arg — so every transport authorizes identically. Four layers: authn session (Stage 1c) → role gate (procedure tiers) → **resource ownership in services** → RLS (deferred, ADR 0011). Define the `actor` shape now (`anonymous | user{userId,role} | system`) so services are authz-aware from day one; reservation services take no actor.

**In scope (Stage 2):** the `actor` convention + procedure tiers + ownership checks in the services that need them.
**Deferred (own ADR, with Stage 1c):** the full role × permission matrix and granular delegated access (scanner/promoter scopes, platform admin) — currently **unimplemented** (the `DelegatedUsers`/`backstage` features were dropped as dead code). New product work; **not** a blocker for the reservation/checkout services.

## Testing (ADR 0010)

- **Unit:** services with an injected fake `prisma` — `getCheckoutConfig` mapping/sorting, `applyCode` gating, fee calc, authz with a fake `actor`. No Postgres.
- **Integration:** the reservation concurrency/idempotency/expire tests against a Supabase **preview branch** (locking can't be mocked).
- Vitest for `packages/*`; Jest stays in `apps/web`. Root `yarn test` fans out.

## Verification

- Per PR: `prisma generate` + workspace `typecheck`; the relevant unit/integration tests green.
- `@troptix/api` (type-only barrel) stays runtime-free for the RN-safety invariant; the server entry is **not** `server-only` (it's consumed by Pages-Router routes — see ADR 0009 update).

## Out of scope

Stage 3 client migration; the legacy-schema drops/renames (gated on Stage 3); Supabase Auth itself (Stage 1c); the full authz model (follow-up ADR); RLS go-live.
