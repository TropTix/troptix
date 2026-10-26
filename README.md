# TropTix

Event ticketing: public event pages, checkout, attendee tickets, and an organizer dashboard. One pnpm workspace holds the web app, the organizer mobile app, and the packages they share.

## Layout

| Path                     | What it is                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `apps/web`               | The Next.js app. See [apps/web/README.md](apps/web/README.md).                               |
| `apps/mobile`            | The organizer app for Expo SDK 54: manage events and scan tickets at the door.               |
| `apps/organizer`         | The older organizer app on Expo SDK 53. Outside the workspace, with its own `yarn.lock`.     |
| `packages/api`           | tRPC router, services, and zod contracts. Business logic lives here, not in routes.          |
| `packages/db`            | Prisma 7 schema and client.                                                                  |
| `packages/transactional` | React Email templates and render helpers.                                                    |
| `e2e`                    | Playwright browser tests for the buyer flow, run against a local Postgres and a fake Stripe. |
| `supabase`               | SQL migrations, the preview-branch seed, and the local CLI config.                           |
| `docs`                   | Roadmap, ADRs, plans, audits, and runbooks.                                                  |

## Run it

You need Node 24, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/local-development).

```sh
corepack enable                       # pnpm 11, pinned in package.json
pnpm install
cp apps/web/.env.example apps/web/.env   # then fill in the values
supabase db start                     # local Postgres with the migrations and seed
pnpm --filter web dev                 # http://localhost:3000
```

The local Postgres covers the buyer flow. Sign-in and flyer uploads need a hosted Supabase project; day-to-day app work points `.env` at the persistent dev branch instead. [apps/web/README.md](apps/web/README.md) explains the variables and which database to use when.

Other root commands: `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test`, and `pnpm e2e`.

## Read next

- [apps/web/README.md](apps/web/README.md): the web app's stack, scripts, and database workflow.
- [CLAUDE.md](CLAUDE.md): conventions for people and agents working in this repo.
- [docs/roadmap.md](docs/roadmap.md): what we are working on and why.
- [docs/adr](docs/adr): the decisions behind the current shape of the code.
