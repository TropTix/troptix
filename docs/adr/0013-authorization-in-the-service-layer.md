# 13. Authorization lives in the service layer

- **Status:** Proposed
- **Date:** 2026-06-09

## Context

Stage 2 extracts a framework-agnostic service layer (`@troptix/api/services`, pure `(prisma, input) => result` functions) called by four transports: the tRPC router (web client + RN), Next server components, the Stripe webhook (REST), and the cron. TropTix has **multiple access levels** — patrons, organizers, the `Role` enum already carries `PATRON`/`ORGANIZER`/`PROMOTER` — and historically had granular delegated access (`DelegatedUsers`: OWNER / TICKET_SCANNER) and a platform-admin surface (`apps/backstage`). Both of those were just removed as **dead code** (the cleanup PR), so granular access is currently **unimplemented**.

The question this ADR settles: **where does authorization live** so it isn't re-implemented (and drifted) per transport?

Two adjacent decisions frame it:

- [ADR 0011](0011-supabase-auth-identity.md) — Supabase Auth provides identity (`authUserId` → stable `User.id`); **RLS** keyed off `auth.uid()` is the Postgres-enforced layer, but **going live on RLS is explicitly deferred** (the app stays on the bypassrls connection until a later hardening step).
- The full role × permission model is a **product decision** and depends on Supabase Auth (Stage 1c) landing first.

## Decision

**Authorization is enforced in the service layer**, via an explicit **`actor`** argument threaded into every service that needs it — never in the route handlers. So tRPC, server components, the webhook, and the cron all pass through the _same_ checks.

Four layers, coarse → fine:

1. **Authentication** — Supabase session → `ctx.session` (Stage 1c). tRPC `protectedProcedure` gate.
2. **Role gate** — the `Role` enum → procedure tiers (`publicProcedure` / `protectedProcedure` / `organizerProcedure`).
3. **Resource ownership** — checked **in the service** (e.g. `event.organizerUserId === actor.userId` before an organizer mutation). This is the load-bearing layer.
4. **RLS** — defense-in-depth, deferred per ADR 0011; flipped on as a later hardening step, not a precondition.

Define the `actor` shape **now**, even before Supabase Auth is wired, so services are authz-aware from day one:

```ts
type Actor =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string; role: Role /* + granted scopes, later */ }
  | { kind: 'system' }; // webhook/cron — deliberately bypasses user checks
```

Reservation primitives (`reserve`/`confirm`/`release`/`expire`) are **actor-agnostic** (they key off reservation / payment-intent ids), so they take no `actor`. Organizer reads and checkout config are actor-scoped.

**Deferred to a follow-up (a successor ADR alongside Stage 1c):** the concrete **role × permission matrix** and **granular delegated access** (re-introducing scanner/promoter scopes, platform admin). That is new product work — the access levels are the owner's call — and it needs real identity (Stage 1c) underneath. This ADR commits only to _where_ enforcement lives and the `actor` seam, not the model.

## Consequences

- **Good:** one enforcement point; every transport is authorized identically; services are unit-testable for authz by passing a fake `actor`; no auth retrofit into services later.
- **Trade-off:** an `actor` is threaded through actor-scoped services (mechanical but pervasive); a forgotten check is a real risk → mitigated by RLS once it goes live, and by tests.
- **Open / new work:** "many access levels" (scanners, promoters, platform admin) is unimplemented after the dead-code cleanup — it's a product + auth decision captured in the follow-up ADR, **not** a blocker for the Stage-2 reservation/checkout services.
- **Depends on / relates to:** [ADR 0011](0011-supabase-auth-identity.md) (identity + RLS), the [API service-layer plan](../plans/2026-06-api-service-layer.md).
