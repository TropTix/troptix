# TropTix

Event ticketing platform. This is a **Yarn Classic (v1) workspaces** monorepo:
the root `yarn.lock` is the single source of truth for dependencies. Use Yarn,
never npm — see [`CLAUDE.md`](./CLAUDE.md) for the full rules.

## Layout

| Path                     | What it is                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `apps/web`               | The Next.js web app. See [`apps/web/README.md`](./apps/web/README.md).                 |
| `apps/organizer`         | Expo (React Native) organizer app — standalone, own lockfile.                          |
| `apps/organizer-v2`      | Expo organizer app, v2 — standalone, own lockfile.                                     |
| `packages/db`            | `@troptix/db` — Prisma client and database schema.                                     |
| `packages/api`           | `@troptix/api` — shared API/service layer.                                             |
| `packages/transactional` | `@troptix/transactional` — transactional email templates.                              |
| `supabase/`              | Supabase configuration.                                                                |
| `docs/`                  | Project docs — roadmap, ADRs, plans, audits. See [`docs/README.md`](./docs/README.md). |

## Getting started

```bash
yarn install            # install all workspaces from the repo root
```

To run the web app, follow [`apps/web/README.md`](./apps/web/README.md) — copy
its `.env.example` to `.env`, then `yarn workspace web dev`.

## Common root scripts

| Command          | What it does                                              |
| ---------------- | --------------------------------------------------------- |
| `yarn dev`       | Run the web app dev server.                               |
| `yarn typecheck` | Type-check every workspace.                               |
| `yarn test`      | Run the Jest test suite.                                  |
| `yarn format`    | Format the repo with Prettier (`format:check` to verify). |

## Conventions

Read [`CLAUDE.md`](./CLAUDE.md) before contributing — it covers where docs live,
the issues-vs-docs split, the workflow for substantial work, formatting
(Prettier + husky pre-commit), and package management.
