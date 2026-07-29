---
name: create-feature-flag
description: Gate the current in-flight work behind an appropriately named PostHog feature flag — registry entry, code gates at minimal seams, flag created at 0% in PostHog. Use when the user wants to merge unfinished work dark, says "put this behind a flag", "create a feature flag", "flag this", or starts a multi-PR initiative that must not change the live product.
---

# Create feature flag

Automates SOP §2 (create) and §3 (merge behind it) from
[docs/runbooks/feature-flags.md](../../../docs/runbooks/feature-flags.md). Read
that runbook first; it wins over this skill on any conflict.

## 1. Identify what's being gated

- Diff the branch against `main` (`git diff main... --stat`, then the files) to
  see the in-flight work. If the branch is clean and the user described future
  work instead, gate the seams they name.
- Find the smallest set of seams where new behavior forks from live behavior:
  ideally **one server seam** (route handler, server action, or server
  component) and **one client seam** (the component that renders the new UI).
- If gating seems to need three or more callsites, stop and restructure the
  code so it needs fewer — don't scatter the flag.

## 2. Name the flag

- Kebab-case, descriptive of the **new capability it enables**:
  `organizer-payouts`, not `new-feature`, and never inverted (no `disable-x`) —
  off must always mean today's live behavior.
- Registry member is the same name in `UPPERCASE_WITH_UNDERSCORE`.
- Check the key isn't already in the registry or PostHog
  (`feature-flag-get-all` via the PostHog MCP).
- Confirm the name with the user only if the work is ambiguous enough that two
  reasonable names gate different scopes.

## 3. Wire the code

1. Add the entry to `FeatureFlag` in
   `packages/api/src/contracts/featureFlags.ts`.
2. Server seam:

   ```ts
   import { isFlagEnabled } from '@/server/lib/featureFlags';
   if (!(await isFlagEnabled(FeatureFlag.ORGANIZER_PAYOUTS, user))) {
     // today's live behavior
   }
   ```

   Pass the signed-in user (`id`, `email`) whenever the seam has one.

3. Client seam:

   ```tsx
   const enabled = useFeatureFlagEnabled(FeatureFlag.ORGANIZER_PAYOUTS); // posthog-js/react
   return enabled === true ? <New /> : <Current />;
   ```

   Only `=== true` is on — `undefined` means "not loaded yet".

4. Typecheck (`yarn typecheck` in `apps/web`, `yarn workspace @troptix/api
typecheck`) and run the touched tests.

## 4. Create the flag in PostHog

Via the PostHog MCP (`create-feature-flag`; run `info` first if the schema
isn't in context):

- Same key, boolean, `active: true`.
- **Release conditions: one group, no properties, `rollout_percentage: 0`.**
- Description: what it gates + link to the umbrella issue/PR.
- Tag `release` (temporary) or `kill-switch` (durable).
- If the user wants to test immediately, add a second condition set:
  `email` `icontains` `@usetroptix.com` at 100% (staff targeting).

If the MCP is unavailable, give the user the exact values above to enter at
PostHog → Feature flags → New feature flag, and don't claim the flag exists.

## 5. Close the loop

- Add a `- [ ] Remove flag \`<key>\`` item to the initiative's umbrella issue
(`gh issue edit`); if there is no umbrella issue, put it in the PR
  description. Cleanup is planned at birth.
- Report: flag key, registry entry, gated seams (file:line), PostHog flag URL,
  and the reminder that off = live behavior until they flip it.
