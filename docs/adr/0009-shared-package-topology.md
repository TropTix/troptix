# 9. Shared-package topology: ship TS source, no turbo, server-only quarantine

- **Status:** Proposed
- **Date:** 2026-06-07

## Context

We are introducing two shared workspace packages — `@troptix/db` (Drizzle schema + client) and `@troptix/api` (typed service layer + tRPC router) — consumed by both `apps/web` (Next.js 16) and `apps/organizer` (Expo/React Native, Metro bundler). The monorepo is currently web-only: root `package.json` `workspaces` lists just `apps/web` (+ a phantom `apps/server`), and `packages/*` are outside the graph. Two hazards drive the design:

1. **Build orchestration.** With compiled packages we'd need a build DAG (turbo/tsc project refs) so consumers see fresh output. That is tooling weight against the "simple" mandate, for a graph of two packages and two real consumers.
2. **Server code leaking into the RN bundle.** `@troptix/api` transitively imports the Drizzle client and `pg`. If the Expo app imports the router *value*, Metro tries to bundle `pg` and fails. Metro cannot tree-shake a `server-only` import away.

## Decision

- **Ship TypeScript source, not compiled JS.** Package `main`/`types` point at `.ts`; Next transpiles via `transpilePackages` (+ `externalDir`, already set), Expo via Babel with Metro `watchFolders` covering the workspace root. No build step.
- **No turbo yet.** Use plain `yarn workspaces foreach` for `typecheck`/`test`. Revisit when a third real consumer lands or CI typecheck time hurts.
- **Two-entry `server-only` quarantine.** Each package exposes a client-safe entry and a server entry: `@troptix/db` (server, `import 'server-only'`) vs `@troptix/db/types` (inferred types, zero runtime imports); `@troptix/api` (type-only barrel: `import type { AppRouter }` + zod contracts) vs `@troptix/api/server` (router value, context, services, `server-only`). The RN app imports only the type-only entries; an ESLint `no-restricted-imports` rule bans the server entries from `apps/organizer`.
- Root `workspaces` → `["apps/*", "packages/*"]`; a `tsconfig.base.json` holds the shared `@troptix/*` path aliases.

## Consequences

- **Good:** zero build orchestration; instant cross-package edits; the RN bundle provably never pulls server runtime; one definition of every type.
- **Trade-off:** every consumer must transpile the shared source (both already do); packages can't be `node`-run without `tsx`; no cached/parallel typecheck until turbo is reconsidered.
- **Risk:** flipping workspace globs re-hoists `node_modules` and can surface React 19.2.1 vs 19.0.0 / RN 0.79 peer skew → mitigated by `nohoist` on the Expo toolchain and a single hoisted TypeScript via `resolutions`. The discipline (type-only imports in RN) is enforced by lint, not convention.
