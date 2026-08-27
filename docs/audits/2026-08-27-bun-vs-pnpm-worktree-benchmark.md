# Benchmark: Bun vs pnpm on this repo

- **Date:** 2026-08-27
- **Type:** Research snapshot / benchmark (frozen on write)
- **Question:** Does Bun beat pnpm on the worktree workflow enough to change the [2026-06-30 recommendation](2026-06-30-package-manager-pnpm-evaluation.md)?
- **Short answer:** Bun is ~3× faster at the worktree step; both end the disk problem; both catch the same phantom deps. Speed alone does not flip the decision — the deciding factors (Dependabot security updates, tooling maturity) are unchanged.

## Method

Same harness as the June audit: throwaway detached worktrees scoped to `apps/web` + `packages/*` (Expo apps excluded), isolated stores/caches (empty by construction), real disk measured by `df` used-space deltas (not `du` — clonefile shares blocks), all on one APFS volume. Single run per cell, same hour, same network.

- **pnpm 11.24.0**, default isolated linker, `linkWorkspacePackages: true`, explicit `allowBuilds` for all 7 script packages (`@prisma/engines`, `core-js`, `esbuild`, `ngrok`, `prisma`, `sharp`, `unrs-resolver`).
- **Bun 1.3.11**, `linker = "isolated"` in `bunfig.toml`; its default trusted list covered every script package (`bun pm untrusted` → 0), so script parity held.
- Node 24.11.1. No lockfile for cold installs; lockfile present (as if committed) for warm and second-worktree runs.

## Results

| Test                                                    | pnpm 11         | Bun 1.3.11      | Yarn v1 (June ref¹) |
| ------------------------------------------------------- | --------------- | --------------- | ------------------- |
| Cold install (empty store, no lockfile)                 | 89.1s           | **60.8s**       | 169.6s              |
| Warm install (store warm, lockfile, fresh node_modules) | 17.2s           | **5.1s**        | 22.0s               |
| New-worktree install (lockfile committed, warm store)   | 16.4s           | **5.9s**        | ~22s                |
| New-worktree true disk cost (`df` delta)                | **~50 MB**      | ~111 MB         | 1,946 MB            |
| Typecheck under strict isolation                        | fails, 6 errs²  | fails, 5 errs²  | passes (masks them) |
| `node_modules` apparent / store size                    | 1.7 GB / 1.5 GB | 1.7 GB / 1.7 GB | 1.9 GB / —          |

1. June numbers came from a different day and network; compare pnpm↔Bun within this run, and treat cross-run deltas as indicative only (pnpm 10 cold measured 54.1s in June vs pnpm 11's 89.1s here — network and `minimumReleaseAge` resolution differences, not a regression finding).
2. Near-identical failure sets — both strict linkers surface the same real issues:
   - `@types/google.maps` still undeclared in `apps/web` (`Cannot find namespace 'google'`) — the last survivor of June's three phantom deps.
   - Stripe instantiated twice against two `@types/node` majors (root pins 20.x, `apps/web` resolves 24.x), so `Stripe` types from `packages/api` and `apps/web` don't unify. Real version skew; a catalog/single `@types/node` pin fixes it.
   - `@types/jest` "is not a module" from `jest.config.ts` under both.
   - pnpm's extra 6th error is resolution drift, not strictness: it picked stripe 22.5.0 (newer API-version literal) where Bun picked 22.3.0.

## Reading

- **Both end the worktree disk problem.** ~50–111 MB per additional worktree vs ~1.9 GB under Yarn. pnpm measured leaner, but at these magnitudes the difference is noise against a 460 GB disk.
- **Bun owns the stopwatch.** ~3× faster at the step that recurs (new worktree: 5.9s vs 16.4s) and ~1.5× cold. The gap per worktree is ~10 seconds.
- **Isolation strictness is equivalent.** The June worry that Bun's isolated linker was unproven on this repo is now partly answered: it installed, linked workspaces, ran Prisma generate, and caught the same phantom deps as pnpm. What one run does not prove: Metro/Expo behavior (out of scope — Expo apps are standalone) and long-tail edge cases.
- **The decision drivers were never speed.** Dependabot security updates for `bun.lock` still don't exist and its workspace update path has open bugs; pnpm's lockfile has mature audit/Dependabot coverage. For a public repo with a 299-alert history, that outweighs ~10s per worktree.

## Verdict

Unchanged: **pnpm**, per the June audit and the 2026-08-26 re-evaluation. Bun is no longer speculative here — it works on this repo and is the faster installer — so the revisit trigger shifts from "if expo/expo#41995 closes" to "when Dependabot security updates cover bun.lock."

Follow-ups surfaced (independent of any migration):

1. Declare `@types/google.maps` in `apps/web`.
2. Unify `@types/node` across root and `apps/web` (Stripe type split).
3. The `@types/jest` config import in `apps/web/jest.config.ts` breaks under any strict linker.
