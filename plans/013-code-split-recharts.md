# Plan 013: Code-split the recharts dashboards out of the main bundle

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4a435eae..HEAD -- apps/web/src/app/organizer/_components/TicketSalesChart.tsx "apps/web/src/app/organizer/events/[eventId]/_components/DailyRevenueChart.tsx"`

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW (visual loading-state change only on organizer dashboards)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `4a435eae`, 2026-06-12
- **Issue**: https://github.com/TropTix/troptix/issues/317

## Why this matters

`recharts` (~hundreds of KB pre-gzip) is imported statically by exactly two components, both on organizer-only dashboard routes: `TicketSalesChart` and `DailyRevenueChart`. Attendee-facing pages (event detail, checkout — the conversion-critical, often-mobile path) shouldn't pay for charting. Lazy-loading the two chart components with `next/dynamic` defers recharts to the routes that use it.

Scope note: the audit also flagged `motion` (used by 6 landing components incl. `providers.tsx`) — that one is structural (page-wide animation provider) and is owned by the design-system standardization plan; do not touch it here.

## Current state

- `apps/web/src/app/organizer/_components/TicketSalesChart.tsx` — `'use client'`; line 4: `import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';` plus shadcn `Card`/chart wrappers.
- `apps/web/src/app/organizer/events/[eventId]/_components/DailyRevenueChart.tsx` — same pattern (`from 'recharts'`).
- These are the ONLY two recharts importers (verified by grep: `grep -rln "from 'recharts'" apps/web/src` → exactly these two files).
- Each is rendered by a parent dashboard page/component (find with `grep -rn "TicketSalesChart\|DailyRevenueChart" apps/web/src --include="*.tsx" | grep -v "Chart.tsx"`).
- Repo conventions: shadcn `Skeleton` component should exist under `apps/web/src/components/ui/` (verify; if absent, use a simple `<div className="h-[300px] w-full animate-pulse rounded-lg bg-muted" />` — Tailwind classes consistent with the design tokens).

## Commands you will need

| Purpose                 | Command                     | Expected on success                                            |
| ----------------------- | --------------------------- | -------------------------------------------------------------- |
| Typecheck               | `yarn typecheck`            | exit 0                                                         |
| Lint                    | `yarn workspace web lint`   | no new errors                                                  |
| Web tests               | `yarn workspace web test`   | exit 0                                                         |
| Bundle proof (optional) | `cd apps/web && yarn build` | recharts chunk separate from main — only if env allows a build |

## Scope

**In scope**:

- The parent components/pages that render `TicketSalesChart` and `DailyRevenueChart` (wrap the imports with `next/dynamic`)
- Possibly two thin wrapper files if the dynamic import is cleaner as a sibling (`TicketSalesChart.lazy.tsx` style is NOT the repo convention — prefer inline `dynamic()` in the parent)

**Out of scope**:

- The chart components' internals.
- `motion`/framer animations (design-system plan).
- Any attendee-facing route.
- `next/bundle-analyzer` installation — nice but not required to land this.

## Git workflow

- Branch: `advisor/013-code-split-charts`
- One commit. Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Locate render sites

`grep -rn "TicketSalesChart\|DailyRevenueChart" apps/web/src --include="*.tsx"` — note each importer (excluding the component files themselves).

**Verify**: you have the exact list of parents.

### Step 2: Convert to dynamic imports

In each parent, replace the static import with:

```tsx
import dynamic from 'next/dynamic';

const TicketSalesChart = dynamic(
  () =>
    import('./_components/TicketSalesChart').then((m) => m.TicketSalesChart),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> }
);
```

Adjust the module path and exported symbol to the real ones (check whether the components are default or named exports first). Match the skeleton height to the chart's actual rendered height (read the chart component for its container sizing — don't introduce layout shift).

Caveat: if a parent is a **Server Component**, `ssr: false` requires the dynamic call to live in a client component — in that case create the smallest possible client wrapper or use `dynamic()` without `ssr: false` (still splits the chunk; SSR of charts is fine, the win is the client bundle split). Prefer the simplest variant that typechecks.

**Verify**: `yarn typecheck && yarn workspace web lint` → no new errors.

### Step 3: Confirm behavior

If a dev env is available: load the organizer dashboard and an event's revenue view — charts render after a brief skeleton; no layout jump; no console errors. If `yarn build` works in your env, confirm recharts lands in an async chunk (look for it in `.next/` build output listing per-route JS sizes — organizer routes bigger, shared/app chunks smaller).

**Verify**: `yarn workspace web test` → exit 0; record build output if obtained.

## Test plan

No unit tests for lazy-loading mechanics (framework behavior). The existing suites + typecheck + the optional build-output evidence are the gate.

## Done criteria

- [ ] `grep -rn "from 'recharts'" apps/web/src` matches only the two chart component files (no new importers), and no parent statically imports the chart components
- [ ] Loading fallbacks sized to prevent layout shift (code-reviewable)
- [ ] `yarn typecheck`, `yarn workspace web lint`, `yarn workspace web test` all clean
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A parent turns out to render the chart above-the-fold as the page's primary content where a skeleton flash is unacceptable — report; the maintainer may prefer SSR-on + split-only.
- `yarn build` (if attempted) fails for env-var reasons — skip the build proof, do not chase env setup.

## Maintenance notes

- Same recipe applies to future heavy, route-local deps (QR rendering, maps) — the grep in Step 1 is the reusable test for "is this dep split-worthy".
- The design-system plan will eventually decide whether recharts stays at all; the dynamic() seam makes a future swap cheaper.
