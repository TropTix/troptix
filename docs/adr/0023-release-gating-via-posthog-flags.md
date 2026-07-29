# 23. Release gating via PostHog flags, remote evaluation, fail closed

- **Status:** Accepted
- **Date:** 2026-07-28

## Context

We want to merge unfinished backend and frontend work to `main` without
changing the live product. That needs a flag system with a UI kill switch that
works without a deploy. PostHog is already integrated in `apps/web` (client
SDK, `/ingest` proxy, an unused `posthog-node` factory), and a previous
Vercel `flags` SDK setup was removed as unused (#472). The web app runs on
Vercel serverless functions, and one PostHog project ("Web") serves prod,
previews, and local dev.

## Decision

- **PostHog feature flags** are the release-gating mechanism, using the
  stable `posthog-js` + `posthog-node` SDKs. No `@posthog/next` (pre-release)
  and no Vercel Flags SDK (server-only, second system for the same flag,
  already removed once).
- **Remote evaluation on the server.** Local evaluation polls flag
  definitions per process and bills each poll as 10 requests; serverless
  multiplies processes. One request per check fits our volume; memoize per
  request before anything cleverer.
- **Fail closed.** Any error, timeout, or missing flag evaluates to `false`,
  and `false` must always mean today's live behavior. Flags are named for the
  new thing they enable, never inverted. A PostHog outage can therefore never
  turn on unfinished code.
- **One registry.** Flag keys live in
  `packages/api/src/contracts/featureFlags.ts` (client-safe, RN-safe);
  helpers are `isFlagEnabled` (server, `apps/web/src/server/lib`) and
  `useFeatureFlagEnabled` (client).
- **Targeting instead of environments.** With a single PostHog project, flag
  state is global. Testing merged-but-dark work happens through release
  conditions (staff email match) and per-browser overrides, not a dev/prod
  project split.
- Users are identified to PostHog (`posthog.identify(user.id, { email })` on
  sign-in, `reset()` on sign-out) so both sides evaluate flags for the same
  distinct id and staff targeting works.

## Consequences

- Any initiative can land in small PRs behind a flag; turning it on or
  rolling it back is a PostHog UI action. The lifecycle SOP lives in
  `docs/runbooks/feature-flags.md`.
- Server checks cost one HTTP round trip (2s timeout). Hot paths must
  memoize per request; if volume ever bites, the escape hatch is local
  evaluation with an external cache, not a rewrite.
- Identify merges anonymous and signed-in activity into one PostHog person
  going forward; person counts in older insights shift accordingly.
- Client hooks return `undefined` before flags load; percentage rollouts of
  visible UI may need the deferred bootstrap work to avoid flicker.
- A mistaken global toggle hits prod immediately. The SOP's guard is
  targeting discipline plus instant rollback; a dev project split stays open
  as a future option.
