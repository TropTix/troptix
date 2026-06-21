# Plan 014: Unit-test the authorization seam (accessControl + authUser)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4a435eae..HEAD -- apps/web/src/server/accessControl.ts apps/web/src/server/authUser.ts apps/web/jest.config.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (tests only; production code changes limited to export keywords if needed)
- **Depends on**: 001 (CI runs the suite); 003 exports `canAccessEvent` — coordinate, don't duplicate
- **Category**: tests
- **Planned at**: commit `4a435eae`, 2026-06-12
- **Issue**: https://github.com/TropTix/troptix/issues/318

## Why this matters

Every organizer route and page trusts two small files — `accessControl.ts` (who may touch an event) and `authUser.ts` (who the request is) — and neither has a single test. The Supabase auth cutover just rewired `authUser.ts` (#308); the IDOR fixed by plan 003 shows what an unguarded gap costs. These are pure-logic functions with injectable boundaries (Prisma client, Supabase client), exactly the kind of code where a dozen unit tests buy durable safety for every future auth refactor.

## Current state

- `apps/web/src/server/accessControl.ts` — exports `isPlatformOwner(email)` (`email.endsWith('@usetroptix.com')`, false for undefined), `verifyEventAccess` (throws Next's `notFound()`), `getEventWhereClause`, `hasPlatformAccess`; `canAccessEvent` is module-private at the planned-at commit (plan 003 exports it — if 003 landed, it's exported).
- `apps/web/src/server/authUser.ts` — `getAuthUserId` (private; returns null when `NEXT_PUBLIC_SUPABASE_URL` unset, or when `supabase.auth.getClaims` returns no `sub` or throws), `resolveByAuthUserId` (private; Supabase sub → app `Users` row via `prisma.users.findUnique({ where: { authUserId } })`, null when unlinked), exported: `getServerUser()`, `getUserFromIdTokenCookie(token?)`, `getCurrentUserProfile()`. Both modules import the Prisma singleton `@/server/prisma` and the Supabase factory `@/lib/supabase/server` (`createClient`).
- Jest works in apps/web: config `apps/web/jest.config.ts` (has `moduleNameMapper` for the `@/` alias — read it to confirm), exemplar test `apps/web/src/hooks/useScreenSize.test.ts`, run via `yarn workspace web test`.
- Mocking convention to establish (none exists yet): `jest.mock('@/server/prisma', ...)` and `jest.mock('@/lib/supabase/server', ...)` at module scope.

## Commands you will need

| Purpose   | Command                   | Expected on success      |
| --------- | ------------------------- | ------------------------ |
| Web tests | `yarn workspace web test` | exit 0, new tests listed |
| Typecheck | `yarn typecheck`          | exit 0                   |

## Scope

**In scope**:

- `apps/web/src/server/accessControl.test.ts` (create)
- `apps/web/src/server/authUser.test.ts` (create)
- `apps/web/src/server/accessControl.ts` — ONLY an `export` keyword on `canAccessEvent` if plan 003 hasn't already added it
- `apps/web/jest.config.ts` — only if the `@/` alias mapping is missing for `src/server` (unlikely)

**Out of scope**:

- Any behavior change in the two modules (if a test reveals a bug, write the test to document **current** behavior, mark it with a `// BUG:` comment, and report — do not fix here).
- Route-handler integration tests (no harness exists; building one is not this plan).
- `apps/web/src/lib/supabase/*` internals.

## Git workflow

- Branch: `advisor/014-auth-seam-tests`
- One or two commits. Do NOT push or open a PR unless instructed.

## Steps

### Step 1: accessControl.test.ts

Mock `@/server/prisma` (an object with `events: { findUnique: jest.fn() }`) and `next/navigation` (`notFound` as a jest.fn that throws a sentinel). Cases:

1. `isPlatformOwner('a@usetroptix.com')` → true
2. `isPlatformOwner('a@gmail.com')` → false
3. `isPlatformOwner(undefined)` → false
4. `isPlatformOwner('a@usetroptix.com.evil.com')` → false (documents why `endsWith('@usetroptix.com')` is safe)
5. `canAccessEvent(uid, ownerEmail, eventId)`: platform owner → true without querying (assert `findUnique` not called)
6. event not found → false
7. `organizerUserId === userId` → true; mismatch → false
8. `verifyEventAccess` on mismatch → throws the notFound sentinel
9. `getEventWhereClause`: platform owner → `{ id }` / `{}`; regular user → includes `organizerUserId`

### Step 2: authUser.test.ts

Mock `@/server/prisma` (`users: { findUnique: jest.fn() }`) and `@/lib/supabase/server` (`createClient` → `{ auth: { getClaims: jest.fn() } }`). Manage `process.env.NEXT_PUBLIC_SUPABASE_URL` per-test (save/restore in beforeEach/afterEach). Cases:

1. env unset → `getServerUser()` → null (and `createClient` never called)
2. `getClaims` resolves `{ data: { claims: { sub: 'auth-1' } } }` + `findUnique` returns `{ id: 'u1', email, role }` → `{ uid: 'u1', ... }` (asserts uid is the **app** id, not the sub — the ADR 0011 contract)
3. `getClaims` resolves no claims → null
4. `getClaims` throws → null (and no unhandled rejection)
5. authenticated sub with **no linked Users row** → null (the provisioning-gap branch)
6. `getUserFromIdTokenCookie('tok')` passes the token through to `getClaims` (assert called with `'tok'`)
7. `getCurrentUserProfile()` queries by `authUserId` and returns the selected shape

Note on module env caching: `getAuthUserId` reads `process.env` at call time (verified — it's inside the function body), so per-test env mutation works without `jest.resetModules()`. If you find otherwise, use `jest.isolateModules`.

### Step 3: Run everything

**Verify**: `yarn workspace web test` → exit 0, ≥16 new tests pass; `yarn typecheck` → exit 0.

## Test plan

This plan IS the test plan. Structural pattern: plain Jest module mocks; follow `useScreenSize.test.ts` for file placement/naming (`<module>.test.ts` colocated).

## Done criteria

- [ ] Both test files exist with the enumerated cases (≥16 tests)
- [ ] `yarn workspace web test` exits 0
- [ ] No production behavior changed (`git diff` on the two source modules shows at most an `export` keyword)
- [ ] Any discovered bug documented via `// BUG:` test comment and reported, not fixed
- [ ] `plans/README.md` status row updated

## STOP conditions

- The jest `@/` alias doesn't resolve `src/server` or `src/lib` and fixing it needs more than a one-line `moduleNameMapper` addition.
- `authUser.ts` has been restructured (e.g. moved into `packages/api` context per ADR 0013) — write the tests against the new location only if the functions are recognizably the same; otherwise report.
- Mocking `next/navigation`'s `notFound` proves flaky under the installed Next version — drop case 8, note it, continue.

## Maintenance notes

- These tests are the safety net for the planned ADR-0013 migration (authorization moving into the service layer): port them alongside the functions when that happens.
- Reviewer: case 5 (auth'd but unlinked user → null) encodes a product decision from ADR 0015's trigger provisioning — if that behavior ever changes to auto-provision on first request, this test is the tripwire that forces the conversation.
