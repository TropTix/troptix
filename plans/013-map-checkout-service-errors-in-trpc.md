# Plan 013: Map checkout service errors to proper tRPC codes (stop leaking 500s to buyers)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat abab1702..HEAD -- packages/api/src/trpc packages/api/src/services/reservations.ts packages/api/src/services/payments.ts packages/api/src/services/_shared/errors.ts`
> If any changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (but coordinate with 009/011 — they add new throws this
  will map)
- **Category**: tech-debt / dx
- **Planned at**: commit `abab1702`, 2026-07-18

## Why this matters

The checkout tRPC router passes service calls straight through with no error
handling, and `initTRPC...create()` has no `errorFormatter`. The reservation and
payment services throw a mix of the typed `NotFoundError` and ~12 **bare
`throw new Error(...)`** for _expected_ buyer-facing outcomes — reservation
expired, wrong status, free/paid mismatch. Every one of these surfaces to the
buyer's UI as `INTERNAL_SERVER_ERROR` (HTTP 500) with the raw message, which
`CheckoutSheet.tsx` renders directly in the error banner. Normal outcomes look
like server crashes, monitoring can't distinguish a real 500 from "hold expired,"
and the codebase's own error taxonomy (`_shared/errors.ts`, which documents that
the tRPC adapter should map these) is unwired. The organizer router already does
per-call mapping; this brings the checkout router in line and turns expected
conditions into clean, typed client errors.

## Current state

- `packages/api/src/trpc/trpc.ts` — no `errorFormatter`:

```ts
const t = initTRPC.context<Context>().create(); // ← no errorFormatter
```

- `packages/api/src/trpc/routers/checkout.ts` — thin pass-throughs, no mapping.
  E.g.:

```ts
beginPayment: publicProcedure
  .input(beginPaymentInputSchema)
  .mutation(({ ctx, input }) => {
    const { stripe, siteUrl } = requireStripe(ctx);
    return beginPayment(ctx.prisma, stripe, { reservationId: input.reservationId, baseUrl: siteUrl });
  }),
```

- `packages/api/src/services/_shared/errors.ts` — the typed errors that already
  exist and are _meant_ to be mapped (`NotFoundError` → 404,
  `UnauthorizedError` → 401/403). Its header comment explicitly says the tRPC
  adapter should map them.

- Bare throws for **expected** buyer outcomes (these should become typed errors
  or a mapped code, not 500s):
  - `payments.ts:60-62` — reservation not HELD ("cannot start payment")
  - `payments.ts:64-66` — reservation expired
  - `payments.ts:67-71` — reservation is free (wrong flow)
  - `reservations.ts:428-432` — reservation is `<status>; cannot confirm`
  - `reservations.ts:579-583` — `<status>; cannot complete`
  - `reservations.ts:585-589` — not free; use paid flow
    (Find them all: `grep -n "throw new Error" packages/api/src/services/payments.ts packages/api/src/services/reservations.ts`.)

- Exemplar mapping style already in the repo —
  `packages/api/src/trpc/routers/organizer.ts:10-45`:

```ts
try {
  return await getEvents(ctx.prisma, ctx.actor);
} catch (e: any) {
  if (e.message === 'UNAUTHORIZED')
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message });
}
```

(This maps by string; prefer mapping by **error class** — see Step 1 — since
the checkout services use typed error classes.)

- `apps/web/src/app/e/[eventId]/_components/CheckoutSheet.tsx:292-297` — where
  these messages surface to the buyer (the `submitError` banner).

## Design decision (do this, don't improvise)

Add **one central mapping** via a tRPC `errorFormatter` (or a shared
error-mapping middleware) in `trpc.ts`, mapping by error class:

- `NotFoundError` → `NOT_FOUND`
- `UnauthorizedError` → `UNAUTHORIZED`
- a new `ConflictError` (add to `_shared/errors.ts`) → `CONFLICT` — for the
  "reservation is in the wrong state / expired / wrong flow" outcomes that are
  currently bare `Error`s.

Then convert the enumerated bare throws in `payments.ts`/`reservations.ts` from
`throw new Error(...)` to `throw new ConflictError(...)`. Leave genuinely
_internal_ invariant violations (e.g. "CONVERTED but has no orderId") as bare
`Error` → they _should_ be 500s. Do not change any service's control flow or
messages beyond the error class.

If you judge that a middleware is cleaner than `errorFormatter` for mapping
thrown classes to `TRPCError`, that's acceptable — but keep it central (one
place), not per-procedure.

## Commands you will need

| Purpose                           | Command                                             | Expected on success |
| --------------------------------- | --------------------------------------------------- | ------------------- |
| Router tests                      | `yarn workspace @troptix/api test routers/checkout` | all pass            |
| Full API tests                    | `yarn workspace @troptix/api test`                  | all pass            |
| Typecheck                         | `yarn typecheck`                                    | exit 0              |
| Web typecheck (client error type) | `yarn workspace web typecheck`                      | exit 0              |

## Scope

**In scope**:

- `packages/api/src/trpc/trpc.ts` (central error mapping)
- `packages/api/src/services/_shared/errors.ts` (add `ConflictError`)
- `packages/api/src/services/payments.ts` and
  `packages/api/src/services/reservations.ts` (reclassify the enumerated
  _expected-outcome_ bare throws only)
- `packages/api/src/trpc/routers/checkout.test.ts` (assert mapped codes)

**Out of scope** (do NOT touch):

- The organizer router's existing string-based mapping — leave it; unifying it
  onto the class-based mapping is a separate cleanup.
- Client UI copy in `CheckoutSheet.tsx` — this plan changes error _codes_, not
  the banner text. (A follow-up can render friendlier copy per code.)
- Any bare `Error` that represents a true internal invariant (leave as 500).
- The REST routes (webhook/cron) — they set their own HTTP status codes and are
  not tRPC.

## Git workflow

- Branch: `advisor/013-checkout-error-mapping`
- Commit per logical unit (add error class + formatter; then reclassify throws);
  Conventional Commits, e.g.
  `feat(api): map checkout service errors to typed tRPC codes`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add `ConflictError` and a central error map

Add `ConflictError extends Error` to `_shared/errors.ts` (mirror the existing
`NotFoundError`/`UnauthorizedError` shape and doc comment: "the operation can't
proceed because the resource is in an incompatible state — e.g. hold expired.
→ HTTP 409; tRPC `CONFLICT`.").

In `trpc.ts`, add an `errorFormatter` (or middleware) that inspects
`error.cause` / the thrown error and sets the tRPC code by class:
`NotFoundError`→`NOT_FOUND`, `UnauthorizedError`→`UNAUTHORIZED`,
`ConflictError`→`CONFLICT`. Preserve the message for these mapped classes; for
anything else, keep the default (`INTERNAL_SERVER_ERROR`) and do **not** leak the
raw message on unmapped errors.

**Verify**: `yarn typecheck` → exit 0.

### Step 2: Reclassify the expected-outcome throws

In `payments.ts` and `reservations.ts`, change ONLY the enumerated bare throws
(listed in Current state) from `throw new Error(...)` to
`throw new ConflictError(...)`, keeping the messages. Do not touch invariant
throws like "CONVERTED but has no orderId".

**Verify**: `grep -n "throw new Error" packages/api/src/services/payments.ts packages/api/src/services/reservations.ts`
shows only the intentional internal-invariant throws remaining.

### Step 3: Assert the mapping in tests

In `routers/checkout.test.ts`, add cases that call a procedure whose service
throws a mapped error and assert the resulting `TRPCError.code`. For example, a
`beginPayment` on an expired reservation → `CONFLICT`; a `getCheckoutState` on a
missing reservation → `NOT_FOUND`. Use the existing `createCaller(createContext({ prisma }))`
fake-prisma harness in that file; make the fake return/throw to drive each branch.

**Verify**: `yarn workspace @troptix/api test routers/checkout` → all pass,
including new mapping cases.

### Step 4: Full suite + web typecheck

**Verify**: `yarn workspace @troptix/api test` → all pass;
`yarn workspace web typecheck` → exit 0 (the client's inferred error type is
unaffected, but confirm nothing depended on the old 500 shape).

## Test plan

- New router tests: each mapped class → its tRPC code (`NOT_FOUND`,
  `UNAUTHORIZED`, `CONFLICT`), plus one unmapped/internal error still →
  `INTERNAL_SERVER_ERROR` with no raw message leaked.
- Model after existing cases in `packages/api/src/trpc/routers/checkout.test.ts`.
- Verification: `yarn workspace @troptix/api test` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `trpc.ts` maps `NotFoundError`/`UnauthorizedError`/`ConflictError` centrally
- [ ] The enumerated expected-outcome throws now use `ConflictError` (Step 2 grep)
- [ ] New router tests assert the correct `TRPCError.code` per class
- [ ] `yarn workspace @troptix/api test` exits 0
- [ ] `yarn typecheck` exits 0
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A service throw you're unsure about could be either an expected outcome or an
  internal invariant — report it rather than guessing its class.
- The tRPC version's `errorFormatter` signature differs from what you expect
  (check `@trpc/server` version in `packages/api/package.json`) and a middleware
  is needed instead — that's fine, but confirm the approach before large edits.
- Changing an error code breaks a client assertion that depended on the 500.

## Maintenance notes

- After this lands, the client can branch on `error.data.code` to show tailored
  copy (e.g. `CONFLICT` → "Your hold expired") instead of raw messages — a good
  follow-up in `CheckoutSheet.tsx`, deferred here.
- The organizer router still maps by string; consider migrating it onto the same
  class-based central map in a later cleanup so there's one convention.
- A reviewer should confirm no _internal_ invariant was downgraded to `CONFLICT`
  (those must stay 500s so real bugs still page).
