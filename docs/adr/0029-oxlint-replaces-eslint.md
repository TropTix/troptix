# 29. oxlint replaces ESLint as the repo linter

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

Linting was thin and ungated. ESLint ran only in `apps/web` (the Next
core-web-vitals preset) and in `apps/organizer` (`expo lint`); `packages/*`
and `apps/mobile` had no linter. Lint was left out of CI because `apps/web`
carried eleven React hook errors nobody had fixed (#312, #418), so new
findings shipped silently. PR #540 had already run oxlint here to host the
anti-slop plugin, then closed for merge conflicts (#563 tracks the redo).

Measured on the same files with the same rules, oxlint 1.8x reported the same
eleven hook errors on the same lines as ESLint 9, including the React Compiler
rules (set-state-in-effect, purity, immutability, static-components), plus the
Next plugin rules, and found unused imports ESLint's preset does not enable.
ESLint took about seven seconds on `apps/web`; oxlint took under a second for
the whole repo.

## Decision

**One root `.oxlintrc.json` lints the pnpm workspace; ESLint is removed.**
`pnpm lint` runs it. CI runs it on every PR, unfiltered, and the pre-commit
hook runs it on staged files. `eslint` and `eslint-config-next` are gone from
`apps/web`.

**Rule set:** the `correctness` category at error, `react-hooks/rules-of-hooks`
at error, `react-hooks/exhaustive-deps` at warn, the `nextjs` plugin scoped to
`apps/web`. Two React Compiler advisories are off
(`react/incompatible-library`, `react/preserve-manual-memoization`): the
compiler is not enabled, and they describe what it would skip optimizing, not
a defect. Revisit if `reactCompiler` is turned on.

**`apps/organizer` stays on `expo lint`.** It is outside the pnpm workspace
with its own lockfile (ADR 25), so the root config ignores it.

**The version is pinned exactly** and must clear pnpm's default minimum
release age. oxlint ships weekly and moves rules between categories between
minors; an upgrade is a deliberate PR that re-runs lint, not a range bump.

**Findings are fixed, not silenced.** A `// oxlint-disable-next-line <rule> -- <reason>`
is for the case the rule cannot see (today: one effect whose state transitions
follow polled server state). Unused directives are an error.

## Consequences

- Lint is fast enough to gate every commit and every PR without path filters.
- `packages/*` and `apps/mobile` are linted for the first time; their findings
  were fixed in the migration PR.
- The anti-slop plugin (#563) becomes one `jsPlugins` entry in the existing
  config rather than a tooling change. oxlint's JS plugin API is still alpha;
  that risk is confined to that plugin.
- Type-aware rules are not enabled. They need TypeScript 7 and are beta in
  oxlint; the ESLint setup they replace was not type-aware either. Decide after
  the TypeScript 7 upgrade.
- ESLint's editor integration is gone. Use the oxc editor extension, or rely on
  the pre-commit hook.
