# 31. Preview builds skip when the web build's inputs are unchanged

- **Status:** Accepted
- **Date:** 2026-09-22

## Context

Vercel built a preview for every push to every branch. Twenty of the last
hundred merges to `main` touched nothing the web build reads: plan and ADR
documents, audits, mobile-only changes, test-only changes. Each of those
still cost a build, and the `dev` mirror branch (ADR 0006) then rebuilt the
same commit as a second preview ninety seconds after the production build.
Stacked PRs multiply this: a restack pushes every child branch at once.

Vercel's built-in "skip unaffected projects" does not help. It treats any
change outside a workspace package, such as `docs/`, as global and builds.

## Decision

`apps/web/vercel.json` sets an Ignored Build Step,
`scripts/vercel-ignore-build.sh`. It diffs the commit against the branch's
last successful deploy (`VERCEL_GIT_PREVIOUS_SHA`) over the paths the web
build reads: `apps/web`, `packages`, and the root manifests, minus Markdown,
test files, and test or lint config. No change there means no build.

The script builds whenever it cannot prove the skip is safe: production
deploys, a branch's first deploy, a base commit outside Vercel's shallow
clone, or system environment variables not exposed. `[skip preview]` in a
commit message skips on purpose.

The `dev` branch keeps deploying. Its preview is the only deploy wired to
the persistent dev database, so it stays useful as a staging URL even when
it repeats a commit production already built. Turning it off is one line
(`git.deploymentEnabled`) if that URL turns out to be unused.

## Consequences

- **Good:** Docs, mobile, Supabase, and test-only pushes stop occupying
  build slots. A PR still gets a preview on its first push and on every
  push that changes web sources, and the diff accumulates across skipped
  commits, so a skip never hides a later change.
- **Trade-off:** Skipped deploys still count toward Vercel's deployment
  limits. They do not run a build, which is the expensive part.
- **Trade-off:** A merge from `main` into a branch builds whenever `main`
  changed web sources since the branch's last deploy, so restacks still
  build. That is correct: the preview should include what it merged.
- **Bad:** The path list is maintained by hand. A new build input outside
  `apps/web`, `packages`, or the root manifests must be added to the script
  or its changes will be skipped.
