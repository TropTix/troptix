# Plan 007: Fix the five ESLint errors in apps/web and gate lint in CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `yarn workspace web lint` — compare its error list
> against the table below. New errors beyond the table are fine to fix if they're
> the same rule classes; a structurally different failure (config error, plugin
> crash) is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW–MED (touches the checkout container and global header; behavior must not change)
- **Depends on**: 001 (CI workflow must exist to add the lint step)
- **Category**: bug / dx
- **Planned at**: commit `4a435eae`, 2026-06-12
- **Issue**: https://github.com/TropTix/troptix/issues/312

## Why this matters

`yarn workspace web lint` currently **exits 1** with 5 errors from the React-compiler/react-hooks rules — real correctness hazards (setState-in-effect cascades, an impure call during render), not style nits. Because no lint gate exists anywhere, these ship silently and new ones accumulate. This plan fixes the errors and makes lint a CI gate so the count stays at zero.

## Current state

`yarn workspace web lint` at the planned-at commit reports (errors only; warnings are out of scope):

| File:line                                                                                                             | Rule message                                                                  |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/web/src/app/_components/toast-tester.tsx:34`                                                                    | Calling setState synchronously within an effect can trigger cascading renders |
| `apps/web/src/app/events/[eventId]/_components/CheckoutContainer.tsx:111`                                             | Calling setState synchronously within an effect can trigger cascading renders |
| `apps/web/src/components/ui/header.tsx:62`                                                                            | Calling setState synchronously within an effect can trigger cascading renders |
| `apps/web/src/app/orders/[orderId]/receipt/page.tsx:215`                                                              | Cannot call impure function during render                                     |
| (one further error reported by the same run — the lint output is the source of truth; fix every line flagged `error`) |                                                                               |

There are also ~5 warnings ("Compilation Skipped: incompatible library", one `react-hooks/exhaustive-deps`) — leave warnings alone.

- ESLint config: `apps/web/eslint.config.mjs` (flat config, `eslint-config-next`).
- CI workflow: `.github/workflows/ci.yml` (created by plan 001). If it doesn't exist, see STOP conditions.
- Conventions: components are function components with hooks; Prettier owns formatting (husky pre-commit).

## Commands you will need

| Purpose   | Command                   | Expected on success                  |
| --------- | ------------------------- | ------------------------------------ |
| Lint      | `yarn workspace web lint` | exit 0 (after fix); warnings allowed |
| Typecheck | `yarn typecheck`          | exit 0                               |
| Web tests | `yarn workspace web test` | exit 0                               |

## Scope

**In scope**:

- Exactly the files the lint run flags with `error` severity (the four named above plus any sibling from the same run)
- `.github/workflows/ci.yml` (append one step)

**Out of scope**:

- Warning-level findings (incompatible-library compilation skips are antd/react-table interop — the design-system plan owns that stack).
- Refactoring `CheckoutContainer` beyond the minimal fix (a TODO in that file proposes a state-manager rewrite — explicitly deferred to the checkout redesign).
- Changing eslint config/rules to silence anything.

## Git workflow

- Branch: `advisor/007-lint-errors`
- Commit per file or one commit; short imperative messages. Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Fix the setState-in-effect errors (3 files)

For each of `toast-tester.tsx:34`, `CheckoutContainer.tsx:111`, `header.tsx:62`: read the surrounding effect. The standard remedies, in order of preference:

1. If the state is derivable from props/state already available → compute during render (possibly with `useMemo`) and delete the effect.
2. If the effect synchronizes with an external value (e.g. media query, scroll) → initialize state lazily (`useState(() => ...)`) and keep the effect only for _subsequent_ changes via the subscription callback.
3. If it genuinely must run post-mount once → leave the effect but make the setState conditional so it cannot loop, and add the values it reads to the dependency array.

Behavior must be pixel-identical; if a fix would visibly change behavior (e.g. removing an intentional "run once after mount" flicker), pick remedy 3.

**Verify** after each file: `yarn workspace web lint` error count decreases; `yarn typecheck` → exit 0.

### Step 2: Fix the impure-call-during-render error

`apps/web/src/app/orders/[orderId]/receipt/page.tsx:215` — an impure function (typically `Date.now()`, `new Date()`, `Math.random()`, or a formatter that reads them) is called in the render body. Hoist the call into `useMemo` (keyed on the data it formats) or compute it where the data is fetched. Same rule: no visible behavior change.

**Verify**: `yarn workspace web lint` → that error gone.

### Step 3: Zero errors, then gate

Run `yarn workspace web lint` → exit 0 (warnings may remain). Then append to the `verify` job in `.github/workflows/ci.yml`:

```yaml
- run: yarn workspace web lint
```

**Verify**: `yarn workspace web lint && yarn typecheck && yarn workspace web test` → all exit 0.

## Test plan

No new unit tests (these are render-behavior fixes verified by the linter itself + existing suites). Manual smoke check if a dev env is available: open the home page (header), an event page (checkout container opens), and an order receipt — no visual change, no console errors.

## Done criteria

- [ ] `yarn workspace web lint` exits 0
- [ ] CI workflow contains the lint step
- [ ] `yarn typecheck` and `yarn workspace web test` exit 0
- [ ] No eslint-disable comments added (`git diff | grep -c eslint-disable` → 0)
- [ ] Only flagged files + ci.yml modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `.github/workflows/ci.yml` does not exist (plan 001 not landed) — fix the errors, skip Step 3's gate, and report.
- A fix requires restructuring `CheckoutContainer`'s state flow (more than ~15 lines) — the checkout redesign owns that file's architecture; report which error is blocked on it.
- The lint run fails for a structural reason (plugin crash, config error) rather than rule violations.

## Maintenance notes

- The "Compilation Skipped: incompatible library" warnings mark components the React Compiler can't optimize (antd/react-table) — they'll disappear as the design-system standardization plan (docs/plans/2026-06-design-system-standardization.md) replaces those deps. Don't chase them now.
- Reviewer: check each fix against "behavior identical" — setState-in-effect fixes are notorious for changing first-paint behavior.
