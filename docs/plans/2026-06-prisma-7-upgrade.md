---
title: Prisma 7 Upgrade (Rust-free client) + relocation into packages/db
status: done
created: 2026-06-08
tracking-issue: TBD
---

# Prisma 7 Upgrade + Relocation into `packages/db`

Upgrade the stack from **Prisma 5.22 → 7.x**, adopt the Rust-free `prisma-client` generator + `@prisma/adapter-pg`, and land Prisma as the ORM of the shared `packages/db`. This **replaces** the Drizzle baseline that was Stage 1a of the [shared-packages platform plan](2026-06-shared-packages-platform.md). Backing decision: [ADR 0012](../adr/0012-prisma-7-instead-of-drizzle.md) (supersedes [ADR 0008](../adr/0008-drizzle-orm.md)). Pipeline unchanged in spirit: plain SQL stays the source of truth ([ADR 0004](../adr/0004-supabase-migrations-as-source.md)); Prisma is the generator.

## Why

The reason ADR 0008 left Prisma — _"the query-engine binary is awkward to share into a Metro/RN bundle"_ — is moot under [ADR 0009](../adr/0009-shared-package-topology.md): the RN app consumes the server over **tRPC/HTTP** and only ever imports **type-only** entries, so Prisma runtime never enters Metro. Prisma 7's Rust-free client closes the remaining gap (engine-free, ESM, `pg` driver adapter). Net: get the light, shareable client **without** porting 40+ call sites or re-verifying the tested reservation primitives (#285).

## Breaking-change reconciliation (verified in-repo)

**v5 → v6 — no applicable changes.** Grep confirms: no implicit m-n relations (every `Model[]` is the parent side of an explicit 1-many FK, so the index→primary-key change doesn't fire), no `Bytes` fields, no `NotFoundError` usage, no `fullTextSearch`, no reserved model names. v6 is a version bump.

**v6 → v7 — the actual work:**

| Change                                               | Action                                                                                                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESM-only                                             | `packages/db` becomes `"type": "module"`; tsconfig already `module: ESNext` / `moduleResolution: bundler`. Next transpiles `@troptix/db`.                                                                        |
| New `prisma-client` provider + **required `output`** | Generated client leaves `node_modules`; emit to a gitignored dir; re-export behind one barrel so call sites don't scatter. `@prisma/client` import path changes.                                                 |
| **Driver adapter mandatory**                         | `@prisma/adapter-pg` + `pg` in `server/prisma.ts`. **+ Supabase SSL** (`ssl: { rejectUnauthorized: false }` to match v6, or proper CA) and **pool settings** (pg has no default connection timeout; v6 used 5s). |
| `prisma.config.ts`                                   | New home for schema path + datasource URL (the `datasource` `url`/`directUrl` are deprecated). Uses `dotenv`.                                                                                                    |
| **`migrate diff` flag renames**                      | Breaks `new-migration.ts`: `--from-url` / `--from-empty` → `--from-config-datasource`; verify `--to-schema-datamodel` → `--to-schema`. The connection moves into `prisma.config.ts`.                             |
| Env not auto-loaded                                  | Scripts already use `tsx --env-file`; `prisma.config.ts` adds `import 'dotenv/config'`.                                                                                                                          |
| `migrate dev`/`db push` no longer auto-`generate`    | N/A — pipeline is custom diff + `supabase db push`; `postinstall: prisma generate` stays explicit.                                                                                                               |

Untouched: `apply-migration.ts` (uses `supabase db push`, not `migrate diff`). No `$use`/`$metrics`/middleware in the codebase. `server/prisma.ts` is already a singleton — only **3 stray `new PrismaClient()`** to fold in.

## Phases (one PR each)

### PR 1 — Prisma 5 → 7, in place in `apps/web`

Validate the two-major upgrade where everything already lives, before any package move.

- Bump `prisma` + `@prisma/client` → `^7`; add `@prisma/adapter-pg` + `pg` (+ `@types/pg`).
- `schema.prisma`: generator → `provider = "prisma-client"`, `output = "../src/generated/prisma"` (gitignored).
- Add root `prisma.config.ts` (schema path; `datasource.url = env(POSTGRES_URL_NON_POOLING)` for CLI/migrations; `dotenv`).
- Rework `server/prisma.ts`: `new PrismaClient({ adapter: new PrismaPg({ connectionString, ssl }) })`, dev-global singleton, pool config. Re-export the generated `Prisma` namespace/types from this barrel.
- Delete the 3 stray `new PrismaClient()`; point them at the singleton.
- Update `@prisma/client` imports → the barrel / generated path.
- Fix `new-migration.ts` for v7 `migrate diff` (config-datasource flags); keep the Supabase timestamp-filename + "review then `yarn db:apply`" contract.
- **Gate:** `prisma generate` clean; `npm run typecheck` green; a no-op `yarn db:new` diff produces empty SQL (proves the pipeline + a real DB connection through the adapter).

### PR 2 — Relocate Prisma into `packages/db`

- Move `schema.prisma` + `prisma.config.ts` + generated output into `packages/db`; `"type": "module"`; `postinstall: prisma generate`.
- `packages/db/src/index.ts` (server entry, `server-only`) exports the `prisma` singleton + `DB`/`Tx` handle types; `packages/db/src/types.ts` re-exports model/enum **types** (RN-safe, erasable) — replacing the Stage-0 placeholders.
- Keep `apps/web/src/server/prisma.ts` as a thin re-export of `@troptix/db` so call sites don't churn a second time (migrate them to `@troptix/db` opportunistically / in Stage 2).
- Re-point the migration scripts at `packages/db`'s schema/config. Pipeline contract unchanged.
- **Gate:** typecheck green across `web` + `@troptix/db`; `@troptix/db/types` stays runtime-free (the RN-safety invariant).

### Then

- **Schema redesign migrations** (was Stage 1b) — on Prisma 7.
- **Supabase Auth** (Stage 1c) — unchanged by this ADR.

## Verification

- **Per PR:** `prisma generate` + `npm run typecheck`; `yarn db:new <noop>` emits empty SQL against a preview/dev branch (datasource via `prisma.config.ts` through the pg adapter).
- **Adapter/Supabase:** confirm the `pg` adapter connects to the Supabase connection (SSL + pooled-vs-direct: use the direct / session-pooler URL; watch pgbouncer transaction-mode + prepared statements). Configure a connection timeout to match v6.
- **Runtime smoke:** an existing read path (e.g. event/dashboard query) returns identical results pre/post upgrade.

## Risks

- **Prisma 7 newness** vs Prisma 5 maturity → upgrade isolated in PR1 with a runtime smoke check before the package move.
- **pg adapter ↔ Supabase pooler** (pgbouncer) → verify connection mode; prefer direct/session pooler for the adapter; set pool timeout.
- **SSL default change** (node-pg vs Rust engine) → `rejectUnauthorized: false` initially, proper CA later.
- **`migrate diff` flag drift** → confirm exact v7 flag names against the CLI reference; gate on an empty no-op diff.

## Out of scope

Drizzle (dropped — ADR 0012). The schema redesign and Supabase Auth (their own stages). Stripe Connect; turbo; the RN app (being rebuilt separately).
