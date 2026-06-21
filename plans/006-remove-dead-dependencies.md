# Plan 006: Remove dead dependencies from apps/web (two on vulnerable lines)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4a435eae..HEAD -- apps/web/package.json apps/web/src/server/lib/emailHelper.ts yarn.lock`
> On drift, re-run every grep in Step 1 before proceeding.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (every removal is verified-unused by grep before deletion)
- **Depends on**: 001 (CI gives the removal a trustworthy green)
- **Category**: tech-debt / security-hygiene
- **Planned at**: commit `4a435eae`, 2026-06-12
- **Issue**: https://github.com/TropTix/troptix/issues/311

## Why this matters

`apps/web/package.json` carries seven dependencies with **zero imports anywhere in `apps/web/src`** (each verified by grep at planning time). Two sit on vulnerable release lines (`js-cookie@^3.0.5` — prototype-pollution advisory fixed in 3.0.7+; `jsonwebtoken@^8.5.1` — the 8.x line has known HIGH advisories). They bloat the lockfile, generate audit noise that buries real signal, and `react-google-maps@9` has been unmaintained since ~2017. One source file is also dead: the SendGrid email helper, whose importer count is zero since the Resend path (`email.ts`) took over.

## Current state

Verified-unused at the planned-at commit (grep across `apps/web/src` for each import):

| Dependency               | apps/web/package.json | Imports found                                                                           |
| ------------------------ | --------------------- | --------------------------------------------------------------------------------------- |
| `axios`                  | dependencies          | 0 (web uses `fetch`; only `apps/organizer` uses axios — different workspace, untouched) |
| `js-cookie`              | dependencies          | 0                                                                                       |
| `cookies-next`           | dependencies          | 0 (Supabase `@supabase/ssr` owns cookies)                                               |
| `jsonwebtoken`           | dependencies          | 0 (Supabase `getClaims` owns JWT verification)                                          |
| `@react-google-maps/api` | dependencies          | 0                                                                                       |
| `react-google-maps`      | dependencies          | 0                                                                                       |
| `@sendgrid/mail`         | dependencies          | only `apps/web/src/server/lib/emailHelper.ts`, which itself has **zero importers**      |

The live map library is `@vis.gl/react-google-maps` (used by `apps/web/src/app/events/[eventId]/_components/EventDetails.tsx`) — keep it. The live email path is Resend via `apps/web/src/server/lib/email.ts` (imported by the checkout initiate route and the Stripe webhook) — keep it.

Also keep (they look like candidates but are used or out of scope): `@types/jsonwebtoken` does not exist (nothing to remove); `micro` is used by the live webhook; `react-google-autocomplete` is used by `EventForm.tsx`.

## Commands you will need

| Purpose          | Command                                                                                                                                                                          | Expected on success                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Re-verify unused | `grep -rn "from 'axios'\|from 'js-cookie'\|from 'cookies-next'\|from 'jsonwebtoken'\|react-google-maps\|@sendgrid\|emailHelper" apps/web/src --include="*.ts" --include="*.tsx"` | matches only `@vis.gl/react-google-maps` in EventDetails.tsx and `emailHelper.ts`'s own SendGrid import |
| Install          | `yarn install`                                                                                                                                                                   | exit 0, lockfile updated                                                                                |
| Typecheck        | `yarn typecheck`                                                                                                                                                                 | exit 0                                                                                                  |
| Web tests        | `yarn workspace web test`                                                                                                                                                        | exit 0                                                                                                  |

## Scope

**In scope**:

- `apps/web/package.json` (remove the seven dependency lines)
- `apps/web/src/server/lib/emailHelper.ts` (delete)
- `yarn.lock` (regenerated by `yarn install`)

**Out of scope**:

- `apps/organizer/**` — it legitimately uses axios; its lockfile is plan 010's problem.
- `@vis.gl/react-google-maps`, `react-google-autocomplete`, `micro`, `resend` — in use.
- Removing the `SENDGRID_API_KEY` env var from Vercel — operator action; report it instead.

## Git workflow

- Branch: `advisor/006-dead-deps`
- One commit. Husky pre-commit will format `package.json`. Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Re-verify every removal target

Run the "Re-verify unused" grep. For each of the seven packages confirm zero imports in `apps/web/src` (excluding `emailHelper.ts`, which you are about to delete). If ANY package has gained an importer since planning, leave that package in place and note it in your summary.

**Verify**: grep output matches the expectation in the table.

### Step 2: Remove

- Delete from `apps/web/package.json` dependencies: `axios`, `js-cookie`, `cookies-next`, `jsonwebtoken`, `@react-google-maps/api`, `react-google-maps`, `@sendgrid/mail`.
- Delete `apps/web/src/server/lib/emailHelper.ts`.
- Run `yarn install` at the repo root to regenerate `yarn.lock`.

**Verify**: `yarn install` → exit 0; `grep -c "js-cookie\|jsonwebtoken@8" yarn.lock` → ideally 0 (a transitive occurrence of js-cookie from another package is acceptable — report it, don't chase it).

### Step 3: Full verification

**Verify**: `yarn typecheck && yarn workspace web test` → exit 0. If plan 001 landed, also confirm the same commands CI runs.

### Step 4: Report operator actions

In your summary: the SendGrid API key (env `SENDGRID_API_KEY` or similar — check Vercel, not the repo) can now be **revoked and removed**; recommend doing so since the integration is dead code.

## Test plan

No new tests — deletions only, guarded by Step 1 greps + typecheck + the existing suites.

## Done criteria

- [ ] The seven packages are absent from `apps/web/package.json`
- [ ] `emailHelper.ts` deleted; `grep -rn "emailHelper" apps/web/src` → 0 matches
- [ ] `yarn install` exits 0 and `yarn.lock` shrank
- [ ] `yarn typecheck` and `yarn workspace web test` exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any of the seven packages has an importer in Step 1's grep (other than emailHelper's own).
- `yarn install` fails to resolve after removal (peer-dependency surprise) — report rather than pinning workarounds.
- Typecheck failures referencing the removed packages from files **outside** apps/web (would indicate cross-workspace leakage).

## Maintenance notes

- `apps/web` has `knip` configured (`yarn workspace web knip`) — running it periodically would catch this class of rot automatically; consider wiring it into CI as a follow-up.
- When plan 002 (legacy endpoints) lands, `micro` loses one of its two importers; when the checkout cutover replaces the webhook, `micro` becomes fully removable.
