# Plan 001: Establish a verification baseline — CI gates, working root scripts, tests green by default

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4a435eae..HEAD -- package.json jest.config.ts .github/workflows packages/api/src/services/reservations.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `4a435eae`, 2026-06-12
- **Issue**: https://github.com/TropTix/troptix/issues/310

## Why this matters

TropTix is a live ticketing platform where money-path code lands via many AI-agent PRs, but CI runs **only a Prettier format check** — no typecheck, no tests. On top of that, the root `yarn dev` script is broken (it calls `npm-run-all`, which is not installed anywhere), the root `yarn test` runs a Jest config referencing a phantom `apps/server` project, and `yarn workspace @troptix/api test` **exits 1** on a machine without a database env (the integration tests correctly skip, but their `beforeAll`/`afterAll` hooks still hit Prisma and fail). Until this lands, no other plan in this directory has a trustworthy "done" signal.

## Current state

- `.github/workflows/` contains exactly two workflows: `format.yml` (Prettier check on changed files — deliberate scope, keep as-is) and `sync-dev-branch.yml` (mirrors `main` → `dev`, keep as-is). There is **no** typecheck/test workflow.
- Root `package.json` scripts:

```json
"scripts": {
  "test": "jest",
  "next": "yarn --cwd apps/web dev",
  "dev": "npm-run-all --parallel next",
  "typecheck": "yarn workspace web typecheck && yarn workspace @troptix/db typecheck && yarn workspace @troptix/api typecheck",
  ...
}
```

`npm-run-all` appears **zero times** in `yarn.lock` — `yarn dev` fails with "command not found".

- Root `jest.config.ts` defines three projects: `web` (testMatch `<rootDir>/apps/web/*` — a non-matching glob), `server` (`<rootDir>/apps/server/*` — **the directory does not exist**), and `organizer` (no testMatch at all). `apps/web` has its own working `apps/web/jest.config.ts` invoked by `yarn workspace web test`.
- `packages/api` uses Vitest (ADR 0010). `packages/api/src/services/reservations.test.ts` is an integration suite that needs a real Postgres (`POSTGRES_PRISMA_URL`, loaded by `packages/api/vitest.config.ts` from `apps/web/.env`). Its header comment says so. Without that env, running `yarn workspace @troptix/api test` produces:

```
Test Files  1 failed | 3 passed (4)
     Tests  15 passed | 5 skipped (20)
```

The 5 tests skip because `beforeAll` throws (`prisma.events.create` fails with no connection), but `afterAll` (lines ~39–56, `prisma.tickets.deleteMany(...)` etc.) still runs and fails — that failure is what turns the exit code red.

- Repo conventions: Prettier auto-formats via husky pre-commit (never `--no-verify`); typecheck command verified working: root `yarn typecheck` exits 0 at the planned-at commit.

## Commands you will need

| Purpose      | Command                            | Expected on success                           |
| ------------ | ---------------------------------- | --------------------------------------------- |
| Install      | `yarn install`                     | exit 0                                        |
| Typecheck    | `yarn typecheck`                   | exit 0                                        |
| API tests    | `yarn workspace @troptix/api test` | exit 0 (after this plan, even without DB env) |
| Web tests    | `yarn workspace web test`          | exit 0                                        |
| Format check | `yarn format:check`                | exit 0 on files you touched                   |

## Scope

**In scope** (the only files you should modify):

- `package.json` (root — scripts only)
- `jest.config.ts` (root — delete)
- `packages/api/src/services/reservations.test.ts` (env guard only)
- `.github/workflows/ci.yml` (create)

**Out of scope** (do NOT touch):

- `.github/workflows/format.yml` and `sync-dev-branch.yml` — working as designed.
- `apps/web/jest.config.ts` and any test under `apps/web` — already working.
- ESLint failures in `apps/web` — a separate plan (007) fixes them; do **not** add a blocking lint job here.
- Adding new tests — plans 005/014 cover that.

## Git workflow

- Branch: `advisor/001-verification-baseline`
- Commit style: short imperative sentence (repo example: `Database migrations pipeline + prod baseline (Phase 0–1)`). Husky will auto-format staged files.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix root scripts

In root `package.json`:

- Change `"dev": "npm-run-all --parallel next"` → `"dev": "yarn --cwd apps/web dev"` and delete the now-redundant `"next"` script.
- Change `"test": "jest"` → `"test": "yarn workspace web test && yarn workspace @troptix/api test"`.

Delete root `jest.config.ts` entirely (the only consumer was the root `test` script). Leave root devDependencies alone (`jest`, `create-jest`, etc. are still used transitively by apps/web's config via hoisting — removing them is out of scope).

**Verify**: `yarn dev` starts the Next dev server (Ctrl-C after it prints "Ready"); `node -e "require('fs').accessSync('jest.config.ts')"` exits non-zero.

### Step 2: Make the api test suite green without a database

In `packages/api/src/services/reservations.test.ts`, add an env guard so the whole file no-ops cleanly when no DB is configured:

```ts
const HAS_DB = Boolean(process.env.POSTGRES_PRISMA_URL);
```

- Convert the top-level `describe` blocks to `describe.skipIf(!HAS_DB)` (Vitest supports `describe.skipIf`).
- Wrap the bodies of `beforeAll` and `afterAll` in `if (!HAS_DB) return;` (the hooks run even for skipped suites — this is the actual cause of the current red exit).
- Keep the explanatory header comment; append one line: tests skip (exit 0) when `POSTGRES_PRISMA_URL` is unset.

Do not change any test logic or assertions.

**Verify**: `env -u POSTGRES_PRISMA_URL yarn workspace @troptix/api test` → exit 0, output shows `5 skipped` and 15 passed, **no failed test files**.

### Step 3: Add the CI workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: yarn
      - run: yarn install --frozen-lockfile
      - run: yarn typecheck
      - run: yarn workspace @troptix/api test
      - run: yarn workspace web test
```

Notes: the api integration tests will skip in CI (no `POSTGRES_PRISMA_URL` secret) — that is expected for now; wiring a preview-branch DB into CI is a documented follow-up in Maintenance notes. Do not add a lint step (plan 007).

**Verify**: `yarn typecheck && yarn workspace @troptix/api test && yarn workspace web test` all exit 0 locally — this is exactly what CI will run.

## Test plan

No new tests. The deliverable is that the existing suites run green via one root command:

- `yarn test` → exit 0 (web jest + api vitest).

## Done criteria

- [ ] `yarn dev` starts the web dev server
- [ ] `yarn test` exits 0 with no DB env configured
- [ ] `yarn typecheck` exits 0
- [ ] Root `jest.config.ts` no longer exists
- [ ] `.github/workflows/ci.yml` exists and mirrors the local commands
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `yarn typecheck` fails **before** you make any change (the baseline has drifted; fixing type errors is not this plan).
- `yarn workspace web test` fails before any change for reasons unrelated to the root config.
- Vitest version in `packages/api` does not support `describe.skipIf` (check `packages/api/package.json`; if so report the version rather than polyfilling).

## Maintenance notes

- Follow-up (not this plan): give CI a `POSTGRES_PRISMA_URL` secret pointing at a Supabase preview branch so the reservation concurrency tests actually run — they are the proof of the oversell guarantee (ADR 0007). Until then they only run on developer machines with `apps/web/.env`.
- Plan 007 should append a `yarn workspace web lint` step to `ci.yml` once the existing lint errors are fixed.
- If `apps/organizer` ever gets tests, extend the root `test` script — do not resurrect the root Jest config.
