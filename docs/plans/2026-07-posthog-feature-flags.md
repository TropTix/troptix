---
title: PostHog feature flags for safe trunk merges
status: active
created: 2026-07-28
tracking-issue: '#485'
---

# PostHog feature flags for safe trunk merges

## Goal

Merge unfinished backend and frontend work to `main` without changing the live product. A feature flag gates the new code path; the flag stays off in production until the work is ready; turning it on is a PostHog UI action, not a deploy. This plan adds the wiring, the conventions, and a standard operating procedure (SOP) so every future initiative can land in small PRs behind a flag.

## Non-goals

- **Experiments / A/B tests.** The wiring supports them later, but this plan covers release flags and kill switches only.
- **The Expo apps.** Neither `apps/organizer` nor `apps/mobile` has PostHog today. The flag registry is placed where mobile can reach it later, but wiring `posthog-react-native` is out of scope.
- **Per-organization entitlements.** "Org X may use paid ticketing" stays a DB column (`Organization.paidTicketingEnabled`, ADR 0019). Flags answer "is this code path live", not "what did this customer buy".
- **Local evaluation.** See Decisions.

## Current state

- `apps/web` has `posthog-js` (client init in [providers.tsx](../../apps/web/src/app/providers.tsx), `/ingest` reverse proxy in `next.config.js`) and `posthog-node` (a factory in `apps/web/src/lib/posthog.ts` that nothing imports).
- **Zero flag usage** anywhere, and zero flags exist in the PostHog project.
- **No `posthog.identify()` anywhere.** Users are anonymous to PostHog, so per-user flag targeting is currently impossible. Identity sources exist: `AuthProvider` (client) and `getAuthUser` / `proxy.ts` (server).
- A previous flags SDK (Vercel `flags`) was removed in #472 as unused. Its `identify` read Supabase claims from cookies and its one flag gated on `email.endsWith('@usetroptix.com')` — the same staff test that `accessControl.isPlatformOwner` uses today. That precedent carries over.
- `apps/web/.cursor/rules/posthog-integration.mdc` (always applied) already fixes conventions: flag names in a TS enum/const with `UPPERCASE_WITH_UNDERSCORE` members, each flag used in as few places as possible, and flag-dependent code gated on a validity check. This plan adopts those rules rather than inventing new ones.
- One PostHog project ("Web") serves prod, previews, and local dev. There is no per-environment flag state.

## Decisions

1. **Remote evaluation on the server, no local evaluation.** PostHog's docs warn against local evaluation in serverless environments: each definitions poll bills as 10 flag requests and per-request clients re-fetch constantly. Vercel functions are exactly that case. Remote evaluation is one billed request per check, needs no secret key, and TropTix volume sits far inside the free tier. Revisit only if flag-request volume shows up on the bill.
2. **Stable SDKs, not `@posthog/next`.** The unified package is pre-release (0.8.x) and its own docs point production apps at the standard setup. We stay on `posthog-js` + `posthog-node`, both already installed.
3. **Fail closed.** If PostHog is unreachable or a flag is missing, every check returns `false` and the product behaves exactly as it does today. A PostHog outage can never turn on unfinished code. Corollary: the flag-off path must always be the current live behavior, so kill switches are named for the _new_ thing they enable, never inverted ("ENABLE_X", not "DISABLE_X").
4. **`undefined` is not `false` on the client.** `useFeatureFlagEnabled` returns `undefined` until flags load. Gated UI treats only `true` as on — which fails closed — but rollout-sensitive UI must not flash. See SOP §5.
5. **One flag registry, client-safe.** Flag keys live in `packages/api/src/contracts/featureFlags.ts` — the existing RN-safe, client-safe contracts barrel — so web client, web server, tRPC services, and (later) mobile all import the same constant. A string literal flag key outside the registry fails review.
6. **Identify users.** `AuthProvider` calls `posthog.identify(user.id, { email })` on sign-in and `posthog.reset()` on sign-out. Server checks pass the same Supabase user id as `distinctId` plus `personProperties: { email }`, so both sides evaluate identically and staff targeting works even before ingestion catches up.
7. **One PostHog project, targeting instead of environments.** With a single project, a flag's state is global. The SOP therefore leans on release conditions (staff email match, then percentage) rather than a dev/prod split. Local-dev overrides happen per browser via the PostHog toolbar or `overrideFeatureFlags` — never by flipping the shared flag.
8. **Durable decision → ADR.** Phase 1 lands ADR 0023 ("Release gating via PostHog flags, remote evaluation, fail closed") recording decisions 1, 3, and 7. (0023 because `0018` is duplicated; the next free number is 0023.)

## Design

### Flag registry — `packages/api/src/contracts/featureFlags.ts`

```ts
export const FeatureFlag = {
  // ORGANIZER_PAYOUTS: 'organizer-payouts',
} as const;

export type FeatureFlagKey = (typeof FeatureFlag)[keyof typeof FeatureFlag];
```

Members `UPPERCASE_WITH_UNDERSCORE` (per the Cursor rule), values kebab-case (PostHog convention). Re-export from the contracts barrel. The registry starts empty; each initiative adds one entry and removes it on cleanup.

### Server helper — `apps/web/src/server/lib/featureFlags.ts`

Replaces the dead `apps/web/src/lib/posthog.ts` (client factory moves with it; `lib/` is the client bucket, `server/lib/` the server one).

```ts
export async function isFlagEnabled(
  flag: FeatureFlagKey,
  user?: { id: string; email?: string | null }
): Promise<boolean> {
  try {
    const client = posthogServerClient(); // posthog-node, short flag timeout
    const enabled = await client.isFeatureEnabled(
      flag,
      user?.id ?? (await anonymousDistinctId()),
      {
        personProperties: user?.email ? { email: user.email } : undefined,
      }
    );
    return enabled === true;
  } catch {
    return false;
  }
}
```

- `anonymousDistinctId()` reads the `ph_<key>_posthog` cookie so an anonymous visitor gets the same verdict on the server as in their browser (matters once a flag has a percentage rollout); falls back to a constant, which is fine while a flag is staff-only or boolean on/off.
- Client per request with `flushAt: 1`; `await client.shutdown()` (or Vercel `waitUntil`) so the `$feature_flag_called` event isn't lost — that event is what makes PostHog's per-flag usage view trustworthy during cleanup.
- Callable from route handlers, server actions, and server components. tRPC procedures get it via a small context field if a service-layer gate is ever needed; don't build that until the first use case.

### Client

- Existing provider stays as is. Gated components use `useFeatureFlagEnabled(FeatureFlag.X)` from `posthog-js/react` and render the new path only on `=== true`.
- `AuthProvider` adds identify/reset as in Decision 6.
- No bootstrap in v1: while a flag is off-for-everyone or staff-only, regular users render the default (live) path with no flicker. Server-side bootstrapping (evaluate in the root layout, pass to `posthog.init({ bootstrap })`) is deferred to the first user-facing percentage rollout where a flash of the old UI would show. It's a known, documented pattern; add it when it earns its keep.

### What a gated merge looks like

- **Route handler / server action:** `if (!(await isFlagEnabled(FeatureFlag.X, user))) return legacyPath();`
- **Client UI:** `const enabled = useFeatureFlagEnabled(FeatureFlag.X); return enabled === true ? <New /> : <Current />;`
- **Schema changes** stay additive while flagged (new nullable columns/tables the old code ignores), per the existing migration flow. The flag gates the code that writes/reads them.
- Per the Cursor rule, keep each flag to as few callsites as possible — ideally one server seam and one client seam.

## SOP — feature flag lifecycle

This section was the reviewed draft; the live copy the team (and agents) follow is [docs/runbooks/feature-flags.md](../runbooks/feature-flags.md).

### 1. When to use a flag

Use a release flag when work merges before it should be live: multi-PR initiatives, backend and frontend landing separately, risky changes to money paths. Skip the flag for trivial fixes, internal-only refactors with no behavior change, or work that ships complete in one reviewed PR.

### 2. Create

1. Add the key to `FeatureFlag` in `packages/api/src/contracts/featureFlags.ts` (member `UPPERCASE_WITH_UNDERSCORE`, value kebab-case, descriptive: `organizer-payouts`, not `new-feature`).
2. Create the flag in PostHog (Feature flags → New): same key, boolean, **Release conditions: 0% of users**, description says what it gates and links the umbrella issue. Tag it `release` (temporary) or `kill-switch` (durable).
3. Note the flag key in the umbrella issue, and add a "remove flag" item to the issue's phase checklist the moment the flag is created — cleanup is planned at birth, not remembered later.

You can do all of this by asking Claude — the PostHog MCP is connected and can create, inspect, and update flags — or in the PostHog UI. The UI is the management surface; the registry file is the source of truth for what the code references.

### 3. Merge behind it

Every PR that adds gated code checks the flag through the registry constant and the standard helpers only (`isFlagEnabled` server-side, `useFeatureFlagEnabled` client-side). Off must equal today's live behavior — reviewer checks this above all else. Keep callsites minimal; if the same flag spreads to a third place, stop and restructure to a single seam.

### 4. Test while off

- **In production, as staff:** edit the flag's release conditions to add a condition set matching `email` ends with `@usetroptix.com` (identify makes this work for signed-in staff). This is the primary way to exercise merged-but-dark features end to end.
- **Locally, quick UI checks:** PostHog toolbar flag override, or `posthog.featureFlags.overrideFeatureFlags({ 'flag-key': true })` in the console. Overrides are per-browser and touch nothing shared.
- Never turn the shared flag on globally "just to test" — one project serves prod and dev alike.

### 5. Roll out

Staff → small percentage → 100%, watching PostHog (errors, funnels) between steps. Before any percentage rollout of visible UI, decide whether flag-load flicker is acceptable; if not, do the bootstrap work first (see Design). Rollback at any point = set conditions back to 0% — no deploy.

### 6. Clean up

A flag at 100% is done. Within two weeks of full rollout:

1. Remove the gate: delete the old path, the flag checks, and the registry entry in one PR.
2. After that PR deploys, delete (or archive) the flag in PostHog.
3. Tick the "remove flag" item in the umbrella issue.

Monthly hygiene: check PostHog's **Stale** filter (Feature flags → filter: Stale) and open a cleanup issue for anything sitting there. A long-lived exception must be tagged `kill-switch` with a description saying why it stays.

### 7. Failure rules (always)

- Server checks fail closed: any error or missing flag → `false` → live behavior.
- Client checks treat only `true` as on; `undefined` means "not loaded yet", not "off".
- Never branch on a flag inside a webhook or cron in a way that could half-process money. Gate at the entry seam, not mid-transaction.

## Phases

1. **Plan review** — this PR. Reviewer approves the approach and the SOP.
2. **Foundations PR** — registry file (empty), `isFlagEnabled` helper + server client move, identify/reset in `AuthProvider`, `docs/runbooks/feature-flags.md` (SOP verbatim), ADR 0023. Verified with a throwaway `smoke-test` flag created in PostHog, exercised server- and client-side behind staff targeting, then removed end to end — proving the whole lifecycle including cleanup.
3. **First real use** — the next merged-early initiative adopts the SOP; whatever friction appears gets folded back into the runbook.
4. **Deferred until needed** — client bootstrap for flicker-free rollouts; tRPC context field for service-layer gates; `posthog-react-native` for `apps/mobile` reusing the same registry.

## Risks and open questions

- **Identify changes analytics identity.** Adding `identify()` merges anonymous and signed-in activity into one person going forward. That is the correct end state, but expect person counts in existing insights to shift when Phase 2 lands.
- **Single project means shared flag state.** A mistaken global toggle hits prod. The SOP's answer is targeting discipline plus instant rollback; a second PostHog project for dev remains an option if this ever bites.
- **Flag-request volume** is billed per server check at one request each. At current traffic this is well inside the free tier; if a flag check lands on a very hot path, memoize per request rather than reaching for local evaluation.
