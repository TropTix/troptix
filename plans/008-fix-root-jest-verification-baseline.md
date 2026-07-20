# Plan 008: Repair the root `yarn test` command so it runs only the real web tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`, and post a short progress comment on the
> tracking issue (#457) when you start and finish.
>
> **Drift check (run first)**: `git diff --stat abab1702..HEAD -- jest.config.ts packages/api/vitest.config.ts apps/web`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests / dx
- **Planned at**: commit `abab1702`, 2026-07-18
- **Issue**: https://github.com/TropTix/troptix/issues/457

## Why this matters

The repo's headline verification command is `yarn test` (root `package.json` →
`jest`). Its Jest config defines three "projects", one of which (`organizer`)
has **no `testMatch` at all**, so Jest defaults to scanning the entire
repository. That sweep picks up the `packages/api/**/*.test.ts` files, which are
**Vitest** integration tests that `import { ... } from 'vitest'` and connect to a
real Postgres. Run under Jest they error or hang. Meanwhile the `web` project's
`testMatch` is `<rootDir>/apps/web/*` — direct children of `apps/web/` only,
non-recursive — so it matches **none** of the real tests under
`apps/web/src/**`. Net effect: there is no single working command that answers
"did the web app's tests pass?", and any executor (human or agent) has to know
the per-package commands out of band. Every other plan in this set relies on a
trustworthy verification baseline; this establishes it.

## Current state

- `jest.config.ts` (repo root) — the misconfigured multi-project Jest config:

```ts
const config: Config = {
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  projects: [
    {
      displayName: 'web',
      testMatch: ['<rootDir>/apps/web/*'], // non-recursive → matches nothing real
    },
    {
      displayName: 'server',
      testMatch: ['<rootDir>/apps/server/*'], // apps/server does not exist
    },
    {
      displayName: 'organizer', // NO testMatch → scans whole repo,
    }, // pulls in packages/api Vitest suites
  ],
};
```

- `apps/server/` **does not exist** (verify: `ls apps` shows `organizer`,
  `organizer-v2`, `web`). The `server` project is dead.
- `apps/web/jest.config.ts` exists and configures `next/jest` for the web app
  (jsdom). The web tests live under `apps/web/src/**/*.test.{ts,tsx}`.
- `packages/api` uses **Vitest** (ADR 0010): `packages/api/package.json` →
  `"test": "vitest run"`, config in `packages/api/vitest.config.ts`. These hit
  real Postgres and must NOT be run by root Jest.
- Repo convention: this is a Yarn v1 workspaces monorepo. Use **yarn, never
  npm** (see `CLAUDE.md` → "Package management"). Per-workspace scripts run via
  `yarn workspace <name> <script>`.

## Commands you will need

| Purpose                                | Command                            | Expected on success                                                                             |
| -------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| List what root Jest would run (before) | `npx jest --listTests`             | currently prints `packages/api/**/*.test.ts` paths (the bug)                                    |
| Root web tests (after fix)             | `yarn test`                        | runs only `apps/web/src/**` tests, exit 0 (or genuine test failures — not Vitest import errors) |
| API package tests                      | `yarn workspace @troptix/api test` | Vitest run (needs a Postgres branch via `POSTGRES_PRISMA_URL`)                                  |
| Typecheck all                          | `yarn typecheck`                   | exit 0                                                                                          |
| Format check                           | `yarn format:check`                | exit 0                                                                                          |

Note: `yarn workspace @troptix/api test` needs a database connection. If it is
not configured in your environment, that is expected — do not treat a missing
`POSTGRES_PRISMA_URL` as a failure of this plan (this plan does not change any
API test). Verify this plan against the **root** and **web** commands.

## Scope

**In scope** (the only files you should modify):

- `jest.config.ts` (repo root)

**Out of scope** (do NOT touch):

- `packages/api/vitest.config.ts`, any `packages/api/**` test — they run under
  Vitest and are correct as-is.
- `apps/web/jest.config.ts` — the web app's own Jest config is correct; this
  plan only fixes the **root** aggregator.
- Do not add, delete, or rename any test file. This is a config-only change.

## Git workflow

- Branch: `advisor/008-fix-root-jest-baseline`
- One commit; message style is Conventional Commits (see `git log`), e.g.
  `test: fix root jest config to run only web tests, exclude api vitest suites`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the bug reproduces

Run `npx jest --listTests` from the repo root. Confirm the output includes
paths under `packages/api/src/services/` (e.g. `payments.test.ts`,
`reservations.test.ts`). That is the misconfiguration.

**Verify**: output contains at least one `packages/api/...test.ts` path.
If it does NOT (the bug is already gone), STOP and report — the config may have
been fixed already.

### Step 2: Rewrite the `projects` array

Replace the three-project array with a single correct `web` project scoped to
the web app's real test glob, and exclude `packages/` defensively. Target shape:

```ts
projects: [
  {
    displayName: 'web',
    testMatch: ['<rootDir>/apps/web/src/**/*.test.{ts,tsx}'],
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/packages/'],
  },
],
```

Remove the dead `server` project (no `apps/server`) and the unscoped
`organizer` project (the source of the whole-repo scan). If you believe an
`organizer` project is actually needed, STOP and report rather than guessing its
`testMatch` — the two Expo apps under `apps/` carry their own tooling and are
not part of the root Jest run.

**Verify**: `npx jest --listTests` → output contains ONLY paths under
`apps/web/` and **no** `packages/api/...` paths.

### Step 3: Run the root command end to end

**Verify**: `yarn test` → Jest runs the web suite. Exit 0, or genuine
web-test assertions (not `Cannot find module 'vitest'` / Postgres connection
errors). If you see Vitest import errors, Step 2's `testPathIgnorePatterns`
didn't take — re-check the glob.

### Step 4: Confirm the API suite still runs under Vitest, untouched

**Verify**: `yarn workspace @troptix/api test` still invokes Vitest (you'll see
Vitest's runner output, not Jest). A Postgres-connection failure here is
acceptable and out of scope; a _runner_ change is not.

## Test plan

No new tests. This is a test-runner configuration fix. Verification is that the
right files are selected by each runner (Steps 2–4).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx jest --listTests` prints only `apps/web/**` paths, zero `packages/**`
- [ ] `yarn test` runs the web suite without Vitest import errors
- [ ] `yarn workspace @troptix/api test` still runs under Vitest
- [ ] `yarn typecheck` exits 0
- [ ] `yarn format:check` exits 0 (or run `yarn prettier --write jest.config.ts`
      on just this file — do NOT run repo-wide `yarn format`, which rewrites
      dozens of unrelated files)
- [ ] `git status` shows only `jest.config.ts` modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `npx jest --listTests` at Step 1 already excludes `packages/` (bug fixed
  independently — this plan is stale).
- You conclude an `organizer` or `server` Jest project is genuinely required
  (don't invent a `testMatch`).
- `yarn test` still errors on Vitest imports after Step 2.

## Maintenance notes

- The canonical per-surface commands remain: web → `yarn test` (Jest/jsdom),
  API services → `yarn workspace @troptix/api test` (Vitest/Postgres), types →
  `yarn typecheck`. A reviewer should confirm no CI job depended on the old
  whole-repo Jest scan.
- If `apps/web` ever adds a second test root, extend the `web` project's
  `testMatch`, keeping the `packages/` ignore in place.
- Follow-up deferred: unifying on one test runner across the monorepo is a
  larger decision (ADR territory), out of scope here.
