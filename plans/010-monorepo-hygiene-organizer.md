# Plan 010: Bring apps/organizer into the monorepo properly (rename + single lockfile)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4a435eae..HEAD -- apps/organizer/package.json apps/organizer/yarn.lock package.json yarn.lock`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (Expo dependency resolution can be sensitive to hoisting; mitigated by the smoke checks and STOP conditions)
- **Depends on**: none
- **Category**: tech-debt / dx
- **Planned at**: commit `4a435eae`, 2026-06-12
- **Issue**: https://github.com/TropTix/troptix/issues/315

## Why this matters

`apps/organizer/package.json` is named `troptix` — the **same name as the repo-root package** — and the app carries its own 444KB `apps/organizer/yarn.lock` alongside the root lockfile. Two lockfiles guarantee version skew (already visible: organizer pins `react@19.0.0` while web is on `19.2.1`), the duplicate name makes `yarn workspace <name>` ambiguous, and the shared-packages platform plan (docs/plans/2026-06-shared-packages-platform.md) needs the organizer inside the workspace graph to consume `@troptix/api` types later. This is the prerequisite plumbing.

## Current state

- Root `package.json`: `"name": "troptix"`, `"workspaces": ["apps/*", "packages/*"]` — the glob includes `apps/organizer`.
- `apps/organizer/package.json:2`: `"name": "troptix"`, `"main": "expo-router/entry"`, Expo ~53, React Native, `@react-native-firebase/*` (intentionally still Firebase auth — do not touch auth deps).
- `apps/organizer/yarn.lock` exists (444,568 bytes) — a nested lockfile from standalone `yarn install` runs inside that directory. Yarn-1 workspaces expect exactly one root lockfile.
- Existing workspace names for the naming convention: `web`, `@troptix/api`, `@troptix/db`. The scoped form is the convention for non-app packages; use `@troptix/organizer` for consistency.
- Expo reads the app identity from `apps/organizer/app.json` (expo.name/slug), **not** from package.json's `name` — renaming the package is safe for the app identity, but scripts inside the organizer (check `apps/organizer/scripts/reset-project.js`) might reference the package name.

## Commands you will need

| Purpose             | Command                                  | Expected on success                                         |
| ------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Workspace graph     | `yarn workspaces info`                   | lists `@troptix/organizer` at `apps/organizer`, no warnings |
| Install             | `yarn install` (repo root)               | exit 0, single root yarn.lock updated                       |
| Organizer typecheck | `cd apps/organizer && npx tsc --noEmit`  | exit 0 (if a tsconfig exists there)                         |
| Organizer lint      | `yarn workspace @troptix/organizer lint` | exits with same result as before the change                 |
| Root checks         | `yarn typecheck && yarn test`            | exit 0                                                      |

## Scope

**In scope**:

- `apps/organizer/package.json` (the `name` field; nothing else)
- `apps/organizer/yarn.lock` (delete)
- `yarn.lock` (root — regenerated)
- `apps/organizer/app.json` / scripts — **read-only** check for references to the old name; only edit if a literal `"troptix"` package-name reference breaks (report it first in the summary)

**Out of scope**:

- Any dependency version bump in the organizer (skew converges naturally via the root lockfile; forcing alignment is not this plan).
- The organizer's Firebase auth stack — intentionally retained until its migration is planned.
- Root `package.json`.

## Git workflow

- Branch: `advisor/010-organizer-workspace`
- Two commits: (1) rename, (2) lockfile consolidation. Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Rename the package

In `apps/organizer/package.json`: `"name": "troptix"` → `"name": "@troptix/organizer"`.

Then grep for hardcoded references: `grep -rn '"troptix"' apps/organizer --include="*.json" --include="*.js" --include="*.ts" | grep -v node_modules | grep -v yarn.lock` — expect only `app.json`'s expo display name (which is the _app_ name, not the package name — leave it).

**Verify**: `yarn workspaces info` (root) lists `@troptix/organizer` with `"location": "apps/organizer"` and no name-collision warning.

### Step 2: Consolidate the lockfile

Delete `apps/organizer/yarn.lock`. From the repo root run `yarn install`.

Expect the root `yarn.lock` to grow substantially (it absorbs Expo/RN resolution). This is correct.

**Verify**: `yarn install` exit 0; `ls apps/organizer/yarn.lock` → not found; `git status` shows only the deletion + root lockfile change (+ the Step-1 rename).

### Step 3: Smoke-check both apps

- `yarn typecheck` (root) → exit 0 (web/db/api unaffected).
- `yarn workspace web test` → exit 0.
- Organizer: `cd apps/organizer && npx tsc --noEmit` if `tsconfig.json` exists → exit 0; and `yarn workspace @troptix/organizer lint` → completes (record its result; pre-existing lint failures are not yours to fix).
- If an iOS/Android simulator is NOT available (likely), the deepest available check is `cd apps/organizer && npx expo-doctor` (or `npx expo install --check`) → no dependency-resolution errors. Record output.

**Verify**: each command's result recorded; nothing newly broken vs. before the change (when unsure, `git stash` to compare baseline).

## Test plan

No new tests (the organizer has no test infrastructure — known). Verification is the workspace-graph check + install + the smoke commands above.

## Done criteria

- [ ] `apps/organizer/package.json` name is `@troptix/organizer`
- [ ] `apps/organizer/yarn.lock` deleted; only the root lockfile remains (`find . -name yarn.lock -not -path "*/node_modules/*"` → 1 result)
- [ ] `yarn workspaces info` shows the organizer with no warnings
- [ ] `yarn typecheck` and `yarn workspace web test` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- `yarn install` at root fails on React Native peer/hoisting conflicts after the lockfile merge. Do **not** start adding `nohoist` config on your own — that's a real decision for the maintainer; report the exact error.
- `expo-doctor` reports resolution errors that did not exist before the merge.
- Anything inside `apps/organizer` imports from the root by the old package name `troptix`.

## Maintenance notes

- Expo + yarn-1 hoisting sometimes needs a `"workspaces": { "nohoist": ["**/react-native", "**/react-native/**"] }` block at the root; it wasn't needed at planning time, but if Metro can't resolve RN modules after this lands, that's the first lever (maintainer decision).
- This unblocks the shared-packages plan's goal of the organizer importing `@troptix/api` types; the version-skew convergence (react 19.0→19.2.1 etc.) will happen on the next dependency PR naturally.
- Reviewer: scan the root `yarn.lock` diff for unexpected _web_ dependency version changes — the merge should add organizer entries, not move web's.
