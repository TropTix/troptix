# @troptix/web

The TropTix web application — a [Next.js](https://nextjs.org/) app for browsing
events and buying tickets. It is one workspace in the TropTix Yarn monorepo and
depends on the shared `@troptix/db`, `@troptix/api`, and `@troptix/transactional`
packages.

## Prerequisites

- **Node.js 24.x** (see the `engines` field in `package.json`).
- **Yarn Classic (v1)** — this repo is a Yarn workspaces monorepo. Use Yarn, not
  npm. See the root [`CLAUDE.md`](../../CLAUDE.md) for the package-management rules.

## Setup

Install dependencies from the **repo root** (Yarn hoists the whole workspace):

```bash
yarn install
```

Then create your local environment file from the template and fill in real
values:

```bash
cp apps/web/.env.example apps/web/.env
```

See [`.env.example`](./.env.example) for the full list of variables, grouped by
service (App URL, Supabase, Postgres, Stripe, Resend, Google Maps, PostHog).
`.env` is gitignored — never commit real secrets. On Vercel, the `VERCEL_*` and
`NODE_ENV` variables are injected automatically and do not need to be set.

## Running

All commands below are run from this workspace (`apps/web`). Run them with
`yarn workspace web <script>` from the repo root, or `cd apps/web` first.

| Command           | What it does                                                            |
| ----------------- | ----------------------------------------------------------------------- |
| `yarn dev`        | Start the Next.js dev server at http://localhost:3000.                  |
| `yarn dev:mobile` | Start the dev server configured for mobile-device testing.              |
| `yarn build`      | Production build (runs `prebuild` → generates the Prisma client first). |
| `yarn start`      | Serve the production build (run `yarn build` first).                    |
| `yarn typecheck`  | Type-check with `tsc --noEmit`.                                         |
| `yarn lint`       | Run ESLint.                                                             |
| `yarn test`       | Run the Jest test suite.                                                |
| `yarn test:watch` | Run Jest in watch mode.                                                 |
| `yarn knip`       | Find unused files, dependencies, and exports.                           |

### Database migrations

These scripts read the Postgres connection strings from `.env`:

| Command         | What it does              |
| --------------- | ------------------------- |
| `yarn db:new`   | Scaffold a new migration. |
| `yarn db:apply` | Apply pending migrations. |

## Learn more

- Repo-wide conventions: [`CLAUDE.md`](../../CLAUDE.md) at the monorepo root.
- Project documentation: [`docs/`](../../docs).
