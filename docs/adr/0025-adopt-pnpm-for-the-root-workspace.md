# 25. Adopt pnpm for the root workspace

- **Status:** Accepted
- **Date:** 2026-08-27

## Context

The root workspace ran on Yarn Classic v1, frozen upstream since 2020. Its flat
hoisting let packages import dependencies they never declared, every git
worktree paid a full ~1.9 GB `node_modules`, and lockfile drift had already
caused a 159-alert Dependabot incident. Two audits ground the choice: the
[2026-06-30 evaluation](../audits/2026-06-30-package-manager-pnpm-evaluation.md)
(pnpm over Berry, npm, Bun, and staying put) and the
[2026-08-27 benchmark](../audits/2026-08-27-bun-vs-pnpm-worktree-benchmark.md)
(Bun is the faster installer; pnpm wins on Dependabot security coverage and
isolation maturity). The June blocker — Expo SDK 53 forcing a hoisted layout
workspace-wide — dissolved when the Expo apps became standalone with their own
lockfiles.

## Decision

The root workspace (`apps/web` + `packages/*`) uses pnpm 11 with the default
isolated linker. The version is pinned in the root `packageManager` field and
activated via Corepack. `pnpm-lock.yaml` (imported from `yarn.lock` to keep
resolved versions) is the only root lockfile. Settings live in
`pnpm-workspace.yaml`: workspace membership, `linkWorkspacePackages` (internal
deps use plain versions), `overrides` (replacing Yarn `resolutions`), and
`allowBuilds` (explicit list of dependencies allowed to run postinstall
scripts). The Expo apps (`apps/mobile`, `apps/organizer`) stay out of the
workspace on their own lockfiles.

## Consequences

- New worktrees cost ~50 MB and ~16s instead of ~1.9 GB and ~22s (hardlinked
  content-addressable store; measured in the 2026-08-27 audit).
- Strict isolation: undeclared imports fail typecheck instead of working by
  hoisting accident. Three latent bugs surfaced and were fixed in the
  migration (undeclared `@types/google.maps` and `jest` in `apps/web`, and a
  root/web `@types/node` major skew that split Stripe's types).
- Postinstall scripts are opt-in via `allowBuilds`; a new dependency that needs
  one fails loudly until listed. Accepted as supply-chain hygiene.
- Vercel reads the pinned pnpm via Corepack, which requires the
  `ENABLE_EXPERIMENTAL_COREPACK=1` project env var — pnpm 11 is not yet in
  Vercel's auto-detected version table.
- Bun was the faster installer in the benchmark (~3× at the worktree step) but
  `bun.lock` has no Dependabot security-update support. Revisit if that ships.
