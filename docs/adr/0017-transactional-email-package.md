# 17. Transactional email as a shared package: render-vs-transport split

- **Status:** Accepted
- **Date:** 2026-06-16

## Context

Order-confirmation email was authored with React Email (templates) and sent
with Resend, all living inside `apps/web`: the template at
`apps/web/emails/EmailConfirmation.tsx`, the render + Resend client in
`apps/web/src/server/lib/email.ts`, and the React Email preview server bolted
onto the web app's `package.json` (`"email": "email dev"`, plus
`react-email` / `@react-email/*` as web dependencies).

Three problems with that shape:

1. **App coupling.** Templates can't be reused by `apps/organizer*` or a future
   email worker without importing across an app boundary.
2. **Dev tooling in the production app.** The React Email preview server and its
   deps sat in the deployed web app's dependency tree purely as a dev aid.
3. **Mixed concerns.** Rendering (React → HTML, reusable) and the Resend
   transport (an app concern) were entangled in one server lib.

Resend's own monorepo guidance and the official
`resend/react-email-*-example` repos all put templates in a dedicated package
that apps import. React Email 2.0+ added yarn-workspace support and esbuild
bundling for the preview server, so a template in a shared package renders
correctly without hoisting hacks.

## Decision

- **New package `@troptix/transactional`** (`packages/transactional`) owns the
  React Email templates (`emails/`) and a thin builder layer
  (`src/orderConfirmation.ts`, `src/index.ts`). It follows the
  [ADR 9](0009-shared-package-topology.md)
  topology: ships TS/TSX source (no build step), added to web's
  `transpilePackages`, `main`/`types` point at source.
- **Render vs transport split.** The package exposes pure builder helpers —
  `buildOrderConfirmation(order, { baseUrl }) => Promise<{ subject, html }>` —
  and the template components, and imports **no** mail transport. The **subject
  lives in the package**, beside the template, so "what this email is" — subject
  and body — stays in one place; the app owns only "who to send it to and how."
  `apps/web` keeps `resend` and its `email.ts` shrinks to: fetch order (Prisma)
  → resolve the flyer to an absolute URL
  ([ADR 16](0016-supabase-storage-for-event-images.md)) →
  `buildOrderConfirmation(order, { baseUrl })` → `resend.emails.send(...)`.
- **Environment-agnostic templates.** The template takes no ambient config — the
  absolute `baseUrl` for in-email links is passed in by the caller, never
  sniffed from `NODE_ENV`. A shared template rendered from preview/staging or a
  future email worker would otherwise emit prod-apex or `localhost` links. The
  caller owns the origin: `apps/web` resolves it via a shared
  `getAppBaseUrl()` helper (`@/lib/appUrl`) from Vercel's auto-injected system
  env vars (preview → the deploy's own `VERCEL_URL`; production →
  `VERCEL_PROJECT_PRODUCTION_URL`, the canonical domain, so no hardcoded host;
  local → `NEXT_PUBLIC_APP_URL` override or `localhost`), so no manual env
  wiring is needed for links to be correct per environment. Depends on "Enable
  access to System Environment Variables" in the Vercel project (already on).
- **Preview server moves into the package.** `"email": "email dev"` and all
  `react-email` / `@react-email/*` deps move out of `apps/web` and into
  `packages/transactional`. `react`/`react-dom` are peer deps there.

## Consequences

- **Good:** templates are reusable across apps and a future email worker; the
  deployed web app no longer carries the preview server or React Email CLI;
  the builder is independently typecheckable and unit-renderable (verified: it
  produces the confirmation subject + HTML in plain Node via `tsx`).
- **Trade-off:** the absolute-URL resolution for the flyer stays in the caller,
  not the template — the template documents that `event.imageUrl` must already
  be absolute. This keeps the package free of Supabase/storage knowledge.
- **Note:** `email dev` (the preview server, Next-based) resolves its project
  root via the nearest lockfile and gets confused when run **inside a git
  worktree** that has its own `yarn.lock` alongside the main checkout's —
  it errors with `Cannot read properties of undefined (reading 'filter')`.
  Run the preview server from a primary checkout, not a worktree. The
  production render path is unaffected.
