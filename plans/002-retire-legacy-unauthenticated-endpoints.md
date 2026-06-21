# Plan 002: Retire the unauthenticated legacy user/payment endpoints

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4a435eae..HEAD -- apps/web/src/pages/api apps/web/src/server/lib/auth.ts apps/web/src/server/lib/userHelper.ts apps/web/src/app/api/user/create`
> On any drift, compare "Current state" excerpts against live code; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (possible out-of-repo legacy client; mitigated by the operator gate in Step 0)
- **Depends on**: none (001 recommended first for CI coverage)
- **Category**: security
- **Planned at**: commit `4a435eae`, 2026-06-12
- **Issue**: merged via [#344](https://github.com/TropTix/troptix/pull/344) on 2026-06-17

## Why this matters

Three legacy endpoints in the live web app are reachable by anyone on the internet with no authentication:

1. `apps/web/src/pages/api/users/index.ts` — GET returns any user's full profile (email, name, social accounts) by ID; PUT updates any user's name/phone/billing address by client-supplied ID; POST creates users with a client-supplied primary key.
2. `apps/web/src/pages/api/stripe/index.ts` — `CREATE_CHARGE` creates a Stripe PaymentIntent with a **client-supplied amount** (`amount: charge.total`) and returns an ephemeral key for **any** user's Stripe customer (`charge.userId` is unverified) — exposing saved payment methods and enabling pay-what-you-want flows.
3. `apps/web/src/app/api/user/create/route.ts` — creates a `Users` row with a client-supplied `id`/`email`, no auth.

**Nothing in this repo calls any of them.** A grep across `apps/web` and `apps/organizer` finds zero callers (the organizer app only calls `/api/organizer/*`). They appear to have served an old attendee mobile app that is not in this repo, and user creation is now handled by the Supabase provisioning trigger (ADR 0015, migration `20260610183059_add_user_provisioning_trigger.sql`). The fix is deletion, gated on the operator confirming there is no live external traffic.

## Current state

- `apps/web/src/pages/api/users/index.ts:37` — `export default allowCors(handler);` with handlers `addUser` (line 39, `prisma.users.create({ data: getPrismaCreateUserQuery(body.user) })`), `getUserById` (line 68, returns user + `socialMediaAccounts` with no auth check), `putUserDetails` (line 97, `prisma.users.update({ where: { id: user.id } ... })`).
- `apps/web/src/pages/api/stripe/index.ts:25` — `export default allowCors(handler);`; `createCharge` (line 46) reads `body.charge`, creates/looks up a Stripe customer from `charge.userId` with no identity check, then:

```ts
const ephemeralKey = await stripe.ephemeralKeys.create(
  { customer: customerId },
  { apiVersion: MOBILE_STRIPE_API_VERSION }
);
const paymentIntent = await stripe.paymentIntents.create({
  amount: charge.total,   // ← client-supplied
  currency: 'usd',
  customer: customerId,
  ...
```

- `apps/web/src/server/lib/auth.ts` — the `allowCors` wrapper sets `Access-Control-Allow-Credentials: true` **and** `Access-Control-Allow-Origin: *`. Its only importers are the two files above.
- `apps/web/src/server/lib/userHelper.ts` — `getPrismaCreateUserQuery` / `getPrismaUpdateUserQuery` / `getPrismaUpdateSocialMediaQuery`; only importer is `pages/api/users/index.ts` (verified by grep at planning time).
- `apps/web/src/app/api/user/create/route.ts` — App Router POST, comment header says `app/api/auth/signup/route.ts`; does `prisma.users.create({ data: { id, email, firstName, lastName } })` from the raw request body.
- NOT in scope but related: `apps/web/src/pages/api/stripe/webhook.ts` (signature-verified, live — plan 005 hardens it) and `apps/web/src/pages/api/vercel/flags.ts` (Vercel toolbar flags — leave alone).
- Convention: the web app's authenticated API routes resolve identity via `getUserFromIdTokenCookie(token)` from `apps/web/src/server/authUser.ts` — see `apps/web/src/app/api/organizer/orders/[eventId]/route.ts:1-26` for the pattern, if the fallback (Step 4 alternative) is needed.

## Commands you will need

| Purpose   | Command                                                                                                                                                                 | Expected on success                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Typecheck | `yarn typecheck`                                                                                                                                                        | exit 0                                                |
| Web tests | `yarn workspace web test`                                                                                                                                               | exit 0                                                |
| Callers   | `grep -rn "api/users\|api/stripe'\|CREATE_CHARGE\|GET_USERS_BY_ID\|user/create" apps --include="*.ts" --include="*.tsx" \| grep -v "pages/api" \| grep -v node_modules` | only matches inside the files being deleted (or none) |

## Scope

**In scope** (modify/delete only these):

- `apps/web/src/pages/api/users/index.ts` (delete)
- `apps/web/src/pages/api/stripe/index.ts` (delete)
- `apps/web/src/app/api/user/create/route.ts` (delete)
- `apps/web/src/server/lib/auth.ts` (delete — only if Step 2's grep confirms no remaining importers)
- `apps/web/src/server/lib/userHelper.ts` (delete — only if Step 2's grep confirms no remaining importers)
- `apps/web/src/server/lib/stripe.ts` (only to remove the `MOBILE_STRIPE_API_VERSION` export **if** it becomes unused)

**Out of scope** (do NOT touch):

- `apps/web/src/pages/api/stripe/webhook.ts` — live Stripe webhook (plan 005).
- `apps/web/src/pages/api/vercel/flags.ts` — used by the Vercel toolbar.
- The organizer app, `packages/*`, any `app/api/organizer/*` or `app/api/checkout/*` route.

## Git workflow

- Branch: `advisor/002-retire-legacy-endpoints`
- One commit per step is fine; short imperative messages. Husky auto-formats.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Operator gate (do not skip)

These endpoints may serve an out-of-repo legacy attendee mobile app. Before deleting, the **operator** must confirm in writing (in the dispatch instruction or a note in `plans/README.md`) that production logs (Vercel → Functions) show no recent traffic to `/api/users`, `/api/stripe` (POST), and `/api/user/create`. If that confirmation is not present, STOP and report — do not proceed on your own judgment.

### Step 1: Verify zero in-repo callers

Run the "Callers" grep from the table above. Expected: no matches outside the three files being deleted.

**Verify**: grep output is empty or limited to the in-scope files.

### Step 2: Delete the three endpoints

Delete `apps/web/src/pages/api/users/index.ts`, `apps/web/src/pages/api/stripe/index.ts`, and `apps/web/src/app/api/user/create/route.ts`.

Then re-grep for the now-orphaned helpers:

```
grep -rn "lib/auth'\|userHelper" apps/web/src --include="*.ts" --include="*.tsx"
```

If the only references were the deleted files, also delete `apps/web/src/server/lib/auth.ts` and `apps/web/src/server/lib/userHelper.ts`. If anything else imports them, leave them and report it in your summary.

**Verify**: `yarn typecheck` → exit 0.

### Step 3: Clean up the now-unused mobile Stripe API version (conditional)

```
grep -rn "MOBILE_STRIPE_API_VERSION" apps/web/src
```

If the only remaining reference is its definition in `apps/web/src/server/lib/stripe.ts`, remove that export and its comment. If the webhook or anything else uses it, leave it.

**Verify**: `yarn typecheck` → exit 0.

### Step 4: Full verification

**Verify**: `yarn typecheck && yarn workspace web test` → both exit 0; `git status` shows only deletions/edits within the in-scope list.

## Test plan

No new tests — the change is deletion. The regression guard is the Callers grep (Step 1) plus typecheck. If the operator instead requests the **harden-not-delete** fallback (live external client exists), that becomes a different plan: report back rather than improvising auth onto these handlers.

## Done criteria

- [ ] The three endpoint files no longer exist
- [ ] `grep -rn "allowCors" apps/web/src` returns nothing (or `auth.ts` was retained with a reported reason)
- [ ] `yarn typecheck` exits 0
- [ ] `yarn workspace web test` exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- Step 0's operator confirmation is absent.
- The Callers grep finds an in-repo consumer of any of the three endpoints.
- Deleting `auth.ts` or `userHelper.ts` breaks typecheck because of an importer the grep missed.
- You find evidence (comments, env flags) that `app/api/user/create` is still called by the current Supabase signup flow — e.g. any reference to it under `apps/web/src/app/auth/` or `apps/web/src/lib/supabase/`.

## Maintenance notes

- After this lands, the only Pages-Router files left are `stripe/webhook.ts` and `vercel/flags.ts`; the checkout-redesign plan (docs/plans/2026-06-checkout-reservation-rebuild.md) already intends to replace the webhook with an App Router route — at that point `src/pages` can be removed entirely.
- If a future attendee mobile app needs payment endpoints, build them on the tRPC layer in `packages/api` (ADR 0013: authorization in the service layer) — never reintroduce client-supplied amounts.
- Reviewer should scrutinize: that no auth/signup flow regressed — sign-in still provisions users via the DB trigger (ADR 0015), not via the deleted route.
