# 10. Vitest for shared packages, Jest stays in apps/web

- **Status:** Proposed
- **Date:** 2026-06-07

## Context

The shared packages ship raw ESM TypeScript ([ADR 0009](0009-shared-package-topology.md)). The core testability goal of the initiative is that services are pure `(db, input) => result` functions, so most new tests are package-local service tests. `apps/web` already has an entrenched Jest setup (jsdom, `@testing-library/react`) for component tests, and the B1 reservation harness (`reservations.test.ts`) uses Jest globals against a real preview Postgres.

Jest needs `ts-jest`/babel and ESM workarounds to run raw-TS ESM packages; Vitest runs TS/ESM natively with near-zero config and is the de-facto runner for Drizzle/tRPC packages.

## Decision

Use **Vitest** for `packages/db` and `packages/api`; keep **Jest** in `apps/web`. Tests live next to their source (`packages/*/src/**/*.test.ts`). Root `yarn test` fans out to both via `yarn workspaces foreach`. The root `jest.config.ts` `projects` array is rewritten to drop the phantom `server` project; the web project stays. The B1 `reservations.test.ts` is ported to `packages/api/services/reservations.test.ts` with a mechanical `jest` → `vi` swap.

Two test tiers in the packages: pure unit tests with an injected fake `db` (no Postgres), and reservation integration tests against a Supabase preview branch (the concurrency/locking guarantees can't be mocked).

## Consequences

- **Good:** minimal-config, native TS/ESM testing where most tests will be written; the web component-test setup is left untouched.
- **Trade-off:** two test runners in the repo; contributors learn both `vi` and `jest` idioms (near-identical APIs).
- **Risk:** none material; the one ported file is a mechanical swap, validated by the existing concurrency assertions still passing.
