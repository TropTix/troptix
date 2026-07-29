# Feature flags — lifecycle SOP

How TropTix merges unfinished work to `main` behind PostHog feature flags. The
wiring and its rationale live in
[docs/plans/2026-07-posthog-feature-flags.md](../plans/2026-07-posthog-feature-flags.md)
and ADR 0023. The rules here bind humans and agents alike.

The pieces:

- **Registry** — `packages/api/src/contracts/featureFlags.ts`. Every flag key
  the code references, and nothing else. String-literal flag keys anywhere
  else fail review.
- **Server check** — `isFlagEnabled(FeatureFlag.X, user)` from
  `apps/web/src/server/lib/featureFlags.ts`. Fails closed.
- **Client check** — `useFeatureFlagEnabled(FeatureFlag.X)` from
  `posthog-js/react`. Only `=== true` counts as on.
- **Control surface** — the PostHog UI (Feature flags, project "Web"), or ask
  Claude: the PostHog MCP can create, inspect, and update flags.

## 1. When to use a flag

Use a release flag when work merges before it should be live: multi-PR
initiatives, backend and frontend landing separately, risky changes to money
paths. Skip the flag for trivial fixes, internal-only refactors with no
behavior change, or work that ships complete in one reviewed PR.

## 2. Create

1. Add the key to `FeatureFlag` (member `UPPERCASE_WITH_UNDERSCORE`, value
   kebab-case, descriptive: `organizer-payouts`, not `new-feature`).
2. Create the flag in PostHog: same key, boolean, **release conditions 0% of
   users**, description says what it gates and links the umbrella issue. Tag
   it `release` (temporary) or `kill-switch` (durable).
3. Add a "remove flag" item to the umbrella issue's checklist now — cleanup is
   planned at birth, not remembered later.

## 3. Merge behind it

Every PR that adds gated code checks the flag through the registry constant
and the standard helpers only. **Off must equal today's live behavior** —
reviewer checks this above all else. Keep callsites minimal (ideally one
server seam and one client seam); if the same flag spreads to a third place,
stop and restructure.

## 4. Test while off

- **In production, as staff:** add a release condition set matching `email`
  contains `@usetroptix.com`. Sign in with a staff account and exercise the
  feature end to end. This is the primary test path for merged-but-dark work.
- **Locally, quick UI checks:** PostHog toolbar flag override, or
  `posthog.featureFlags.overrideFeatureFlags({ 'flag-key': true })` in the
  console. Overrides are per-browser and touch nothing shared.
- Never turn the shared flag on globally "just to test" — one PostHog project
  serves prod, previews, and local dev.

## 5. Roll out

Staff → small percentage → 100%, watching PostHog (errors, funnels) between
steps. Before a percentage rollout of visible UI, decide whether flag-load
flicker is acceptable; if not, do the client bootstrap work first (deferred
design in the plan doc). Rollback at any point = set conditions back to 0% —
no deploy.

## 6. Clean up

A flag at 100% is done. Within two weeks of full rollout:

1. One PR removes the old path, the flag checks, and the registry entry.
2. After it deploys, delete (or archive) the flag in PostHog.
3. Tick the "remove flag" item in the umbrella issue.

Monthly hygiene: check PostHog's **Stale** filter and open a cleanup issue for
anything sitting there. A long-lived exception must be tagged `kill-switch`
with a description saying why it stays.

## 7. Failure rules (always)

- Server checks fail closed: any error or missing flag → `false` → live
  behavior.
- Client checks treat only `true` as on; `undefined` means "not loaded yet",
  not "off".
- Flags are named for the new thing they enable, never inverted (`ENABLE_X`
  semantics, no `DISABLE_X`), so fail-closed always lands on current
  behavior.
- Never branch on a flag inside a webhook or cron in a way that could
  half-process money. Gate at the entry seam, not mid-transaction.
