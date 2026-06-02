---
title: Web Design System Standardization
status: proposed
created: 2026-06-02
tracking-issue: "#277"
---

# Web Design System Standardization

Audit findings, target standards spec, and phased refactor roadmap for `apps/web`. Decisions backing this plan are captured as ADRs: [Tailwind v4 first](../adr/0001-tailwind-v4-first.md), [light-only](../adr/0002-light-only-no-dark-toggle.md), [indigo canonical brand](../adr/0003-indigo-canonical-brand.md). Roadmap summary lives in [`roadmap.md`](../roadmap.md) under Priority 5.

## Context

`apps/web` already has a strong foundation — a shadcn/ui component set (Radix + CVA + `tailwind-merge`), a complete semantic HSL token set in `globals.css`, and `lucide-react` icons. But the design has **drifted away from that foundation**: most pages hand-roll raw Tailwind palette colors instead of using tokens, several config layers are inert or broken, and dead/vestigial code (a second header, Ant Design, legacy CSS) lingers.

This document is the audit findings, the standards spec we're consolidating on, and a phased refactor roadmap.

---

## Current State (verified)

**What's solid (keep):**
- Semantic token set in `apps/web/src/styles/globals.css` (`--primary`, `--foreground`, `--muted`, `--border`, `--card`, `--destructive`, chart + sidebar tokens), correctly wired into `apps/web/tailwind.config.ts` via `hsl(var(--*))`.
- `Button` is canonical — 47 import sites vs only 3 raw `<button>`. Good CVA variants in `apps/web/src/components/ui/button.tsx`.
- `lucide-react` is the de-facto icon system (~60 sites); `sonner` is the single toast system.
- `unified-header.tsx` is the live global header, wired in `apps/web/src/app/providers.tsx`. Organizer pages share a consistent `md:container px-4 py-8` layout.

**Gaps & inconsistencies (fix):**

1. **Color fragmentation — the headline problem.** **~572** raw palette-color utilities across `.tsx` bypass the token system. Two competing neutral ramps (`slate-*` *and* `gray-*`), ad-hoc `green-*` for success and `blue-*` for primary. Worst offenders: `apps/web/src/app/orders/[orderId]/receipt/page.tsx` (39), `apps/web/src/app/orders/[orderId]/confirmation/page.tsx` (33), loading skeletons, `apps/web/src/app/_components/cta.tsx` (29), `apps/web/src/components/ui/footer.tsx` (17), auth forms.

2. **Inert / broken config:**
   - A Tailwind **v4** `@theme inline { … }` block sits in `globals.css` inside a Tailwind **v3.3.3** project — entirely inert.
   - `--shadow-*` and `--font-*` CSS vars are defined but **never wired** into the v3 config, so `shadow-md` / `font-sans` resolve to Tailwind defaults, not the tokens.
   - Inter is loaded (`apps/web/src/components/AuthProvider.tsx`) but applied via `font-inter` — a **non-existent utility** (no `fontFamily.inter` in config), so Inter likely isn't actually rendering.
   - Root wrapper hardcodes `text-gray-900` instead of `text-foreground`, anchoring the whole app off-token.

3. **Dead / vestigial code:**
   - `apps/web/src/components/ui/header.tsx` — **zero imports**, superseded by `unified-header.tsx`.
   - Ant Design — only 4 files: an **empty** `ConfigProvider`, `Spin` (×2), and 2 icons (`apps/web/src/app/events/[eventId]/_components/tickets-checkout-forms.tsx`). Not a real dual-system — just removable.
   - `apps/web/src/styles/buttons.css` — `.btn` used once (ErrorFallback); `apps/web/src/styles/ant.css` overrides target antd components that are likely no longer rendered.
   - `.form-*` classes in `globals.css` hardcode `bg-white border-gray-300`.

4. **Component-level token gaps:**
   - `apps/web/src/components/ui/alert.tsx` `info` variant uses hardcoded `bg-blue-50 text-black border-blue-200`; no `success` / `warning` variants despite the toaster theming all four states.
   - `apps/web/src/components/ui/spinner.tsx` is the only thing pulling in `antd` + `@ant-design/icons`.
   - `apps/web/src/components/ui/logo.tsx` hardcodes the brand HSL inline.

5. **Typography:** `apps/web/src/components/ui/typography.tsx` components are barely adopted (~4 sites) vs ~100+ raw `<h1 className="text-4xl …">`. The components use a `text` prop (not `children`), carry no color tokens, and `DividerWithText` misuses `text-white` on an `<hr>`. There's *also* a parallel `.h1` – `.h4` CSS class set in `globals.css` — a third heading system.

6. **Layout:** public pages each pick their own max-width (`max-w-7xl`, `max-w-5xl`, `max-w-3xl`, `max-w-6xl`) and padding, while organizer pages consistently use `md:container px-4 py-8`. Spacing mixes `gap-3/4/6/8` and `space-y-4/6` with no scale.

**Non-issues (confirmed, don't touch):** legacy `apps/web/src/pages/` is API-only (no UI); `DatePicker.tsx` is a legit composite over `calendar.tsx` (no antd DatePicker); mobile card components layer on `card.tsx` rather than duplicate it.

---

## Target Standards (the spec)

### 1. Color — one source of truth: semantic tokens

- **Rule:** UI colors come from semantic tokens only (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`, `bg-primary`, `text-destructive`, `bg-accent`). No raw `slate-*` / `gray-*` / `blue-*` / `green-*` in app code.
- **Neutral ramp:** collapse both `slate-*` and `gray-*` onto `foreground` / `muted-foreground` / `border` / `muted` / `card`. Pick the token by *role*, not shade.
- **Add missing semantic tokens:** introduce `--success` (replaces `green-*` for metrics / positive states) and `--warning`. This is the one *additive* token change.
- **Brand:** indigo `--primary` is canonical (see [ADR 0003](../adr/0003-indigo-canonical-brand.md)).

### 2. Typography — one system

- Choose **one** heading approach. Recommendation: a single `cva`-based `<Heading level={1..4}>` / `<Text>` primitive using `children` (not a `text` prop) and tokens for color. Retire the `text`-prop `Typography*` components **and** the `.h1` – `.h4` CSS classes.
- Body text defaults to `text-foreground`; secondary text to `text-muted-foreground`.

### 3. Fonts / shadows / radius — wire via v4 `@theme`

- Post-upgrade, define these in CSS `@theme inline` (the block that's currently inert): `--font-sans: var(--font-inter)` applied on `<html>` / `<body>`; delete the no-op `font-inter` class; drop unused Merriweather / JetBrains references.
- Shadows (`--shadow-*`) and radius (`--radius`) become real tokens consumed natively by v4 — no hand-wiring into a JS config.
- **Migration gotcha:** today the color vars store *raw HSL channels* (`238.73 83.53% 66.67%`) and the v3 config wraps them with `hsl(...)`. The orphan `@theme inline` maps `--color-primary: var(--primary)`, which would be invalid (no `hsl()` wrapper). On upgrade, decide once: either keep channel vars and wrap in `@theme` (`--color-primary: hsl(var(--primary))`), or convert vars to full color values (HSL or OKLCH, the v4-shadcn default). Pick OKLCH-or-full-HSL for cleanliness.

### 4. Layout & spacing — standard page shell

- **Rule:** every page wraps in the organizer pattern — `md:container px-4 py-8` (with a documented narrower inner `max-w-*` only for reading-width content like receipts). Migrate public pages off bespoke `max-w-7xl / 5xl / 3xl`.
- **Spacing scale:** cards / related items `gap-4`; major sections `space-y-6`. Document the two values; avoid `gap-3/8` drift.

### 5. Components — canonical set + cleanup

- Keep the shadcn `ui/*` set as canonical. `Button`, `Card`, `Badge`, `Input`, `Form`, `Dialog`, `Select`, `Table` already token-clean.
- Extend `alert.tsx` to token-based `default | destructive | success | warning | info` variants (matches toaster).
- Add an `<EmptyState>` primitive (`icon, title, description, action`) — currently re-implemented per page.
- Replace the antd `Spinner` with a lucide `Loader2`-based spinner so antd can be removed.

### 6. Icons

- `lucide-react` only. Replace `@ant-design/icons` (`Minus` / `Plus` / `LoadingOutlined`) with lucide equivalents; replace inline SVG sort icons in `data-table.tsx`.

---

## Roadmap (phased)

**Phase 0 — Tailwind v4 upgrade (own PR, foundation).** See [ADR 0001](../adr/0001-tailwind-v4-first.md).
- **Pre-check (gating):** confirm buyer browser mix supports v4's baseline (Safari 16.4+ / Chrome 111+ / Firefox 128+) via PostHog analytics, especially on the checkout flow. If a meaningful slice is older, reconsider before proceeding.
- Run `npx @tailwindcss/upgrade` (handles `@tailwind` → `@import "tailwindcss"`, config → CSS, template utility renames).
- Invert config to CSS-first: move the `tailwind.config.ts` color/radius mapping into `@theme` in `globals.css`; fix the token var format per §3 so `@theme inline` resolves; remove the inert/duplicate block.
- Build chain: swap to `@tailwindcss/postcss` (drop `autoprefixer` + manual import handling — Lightning CSS covers both); replace `tailwindcss-animate` → `tw-animate-css`.
- Sweep v4 breaking renames in templates the codemod can't fully infer: shadow scale (`shadow` → `shadow-sm`, `shadow-sm` → `shadow-xs`), `ring` default width, `outline-none` → `outline-hidden`, opacity-utility → slash syntax. The global `* { @apply border-border }` already neutralizes the gray-200 → currentColor default-border change.
- This phase *also* closes the font-wiring and shadow-wiring findings natively.

**Phase 1 — Dead code & vestigial deps.** Delete `header.tsx`; remove Ant Design end-to-end (`ConfigProvider`, `Spin` → lucide `Loader2` spinner, antd icons → lucide, drop `antd` + `@ant-design/icons` deps, delete `ant.css` + the antd overrides in `buttons.css`); migrate ErrorFallback off `.btn` to `Button` and delete `buttons.css`; fix the root wrapper `text-gray-900` → `text-foreground`; convert `.form-*` classes to tokens or delete in favor of `Input`.

**Phase 2 — Neutral ramp consolidation.** Migrate `slate-*` and `gray-*` → semantic tokens. Biggest bang: receipt, confirmation, loading skeletons, footer, auth.

**Phase 3 — Semantic color migration.** Add `--success` / `--warning` tokens (in `@theme`); migrate `green-*` → `success`, stray `blue-*` → `primary`, reds → `destructive`. Consolidate landing cream / magenta onto tokens.

**Phase 4 — Typography + layout primitives.** Ship the single `Heading` / `Text` primitive; retire the other two heading systems. Introduce the standard page shell + spacing scale; migrate public pages.

**Phase 5 — Component polish.** Token-based `alert` variants (`default | destructive | success | warning | info`); `<EmptyState>`; tokenize `logo.tsx`; finish data-table icon swap.

**Phase 6 — Guardrails.** Add an ESLint / Tailwind lint rule (`eslint-plugin-tailwindcss` + a custom restricted-pattern rule) banning raw palette colors in `src/**`, so drift can't recur. Document the standard in a short reference doc.

Phase 0 must land first (everything builds on the v4 token base). Phase 1 is independent. Phases 2–3 are the bulk color sweep; 4+ build on the token base.

---

## Critical files

- **Config / tokens / build:** `apps/web/tailwind.config.ts`, `apps/web/src/styles/globals.css`, `apps/web/postcss.config.js`, `apps/web/package.json` (deps swap in Phase 0), `apps/web/src/styles/ant.css`, `apps/web/src/styles/buttons.css`
- **Wiring:** `apps/web/src/app/providers.tsx`, `apps/web/src/components/AuthProvider.tsx`, `apps/web/src/app/layout.tsx`
- **Components to change:** `apps/web/src/components/ui/alert.tsx`, `spinner.tsx`, `typography.tsx`, `logo.tsx`, `data-table.tsx`
- **Delete:** `apps/web/src/components/ui/header.tsx`
- **Heaviest color migration:** `apps/web/src/app/orders/[orderId]/receipt/page.tsx`, `apps/web/src/app/orders/[orderId]/confirmation/page.tsx`, `apps/web/src/app/_components/cta.tsx`, `apps/web/src/app/_components/hero.tsx`, `apps/web/src/components/ui/footer.tsx`, auth `_components/`

## Verification (per phase, before merge)

- `cd apps/web && yarn typecheck && yarn lint && yarn build` clean.
- **Phase 0 (v4):** build succeeds on the new engine; diff the rendered output visually against pre-upgrade — pay attention to shadows, ring widths, and borders (the utilities that changed semantics). Confirm Inter actually renders now (inspect computed `font-family` on `<body>`). Confirm `@theme` tokens resolve (`bg-primary` is indigo, not transparent).
- Visual smoke (golden path) of each surface in `next dev`: homepage, events list, event detail + ticket modal, checkout / confirmation / receipt, organizer dashboard + event management, auth. Confirm fonts, primary CTAs, cards, badges, and loading / empty states render correctly.
- Track the count down: `grep -rEoh "(bg|text|border|ring)-(gray|slate|zinc|blue|green|red|...)-[0-9]{2,3}" --include="*.tsx" src | wc -l` should trend toward ~0 in app code by end of Phase 3.
- After antd removal: `grep -r "antd" src` returns nothing; `antd` / `@ant-design/icons` gone from `package.json`.

## Out of scope (this pass)

Dark-mode toggle (see [ADR 0002](../adr/0002-light-only-no-dark-toggle.md)); `apps/backstage` and `apps/organizer` (mobile); `apps/web/src/pages/` API routes; any redesign of brand identity beyond consolidating onto the existing indigo token (see [ADR 0003](../adr/0003-indigo-canonical-brand.md)).
