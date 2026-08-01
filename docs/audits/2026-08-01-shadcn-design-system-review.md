# shadcn & design-system review — 2026-08-01

Point-in-time snapshot of `apps/web`'s shadcn/ui usage and design-system state, two months after the [standardization plan](../plans/2026-06-design-system-standardization.md) (#277, still `proposed`, no phase executed). Frozen on write.

## What changed since the June plan

- **Raw-palette drift fell on its own: ~572 → ~114 utility classes.** The worst offenders in the plan (global footer, `cta.tsx`, old landing components) were deleted in #487/#490/#483, not migrated.
- **A new hex-heavy zone appeared.** The rebuilt homepage (`hero.tsx` 29 hex literals, `flyers.tsx` 48) uses a bespoke palette (`#d6407e`, `#f58b2e`, `#2dd4bf`) that exists in no token. It came from designer feedback (#483), so it may be intentional direction, not drift — owner call needed before any sweep touches it.
- **Upstream moved.** shadcn CLI v4 (2026-03); Base UI is the default base for _new_ projects (2026-07) with Radix still fully supported; new-york style now imports one unified `radix-ui` package; registry components are the data-slot / no-forwardRef / OKLCH generation. Official `spinner` and `empty` components exist.
- **Nothing else moved.** Still Tailwind 3.3.3, still the orphan `@theme inline` block, fonts/shadows still unwired, antd still loaded app-wide.

## Component inventory (32 shadcn primitives + 11 app files in `components/ui/`)

Usage across `apps/web/src`:

- **Adopted:** button (37), card (20), input/badge (11), skeleton (8), table (7), form (5).
- **Unused — 7 primitives:** `aspect-ratio`, `checkbox`, `dialog`, `drawer`, `radio-group`, `tabs`, `toggle`. Five Radix deps plus `vaul` are removable with them (`react-dialog` stays — `sheet.tsx` needs it).
- **Unused — 3 app files:** `copy-button.tsx`, `icon.tsx`, `logo.tsx`.
- **Single-use:** calendar+popover (DatePicker only), carousel, collapsible, input-otp, separator.
- All 26 ref-carrying primitives are **old-era** (`React.forwardRef`, no `data-slot`, HSL triplets, old focus-ring recipe). Zero OKLCH anywhere. A `shadcn add` today would emit components incompatible with the set on disk — refresh is all-at-once, gated on Tailwind v4.

## Ant Design is still live

- `providers.tsx` wraps the whole app in an antd `ConfigProvider` with an **empty theme object** — pure bundle cost.
- `components/ui/spinner.tsx` is antd `Spin` + `LoadingOutlined`; `@ant-design/icons` is **undeclared** in `package.json` (resolves by hoisting — breaks on any hoist change).
- Two dead stylesheets `@import`ed by `globals.css`: `ant.css` (styles antd components no longer rendered, hardcodes `#ff4ef6`) and `buttons.css` (`.btn` system — zero usages left).
- `next.config.js` carries ~20 `transpilePackages` entries for antd/rc-\*.
- Removal cost: 2 spinner call sites + 1 provider line.

## Fragmentation

- **Loading states, four idioms:** antd `Spinner` (2), ad-hoc lucide `Loader2` (6), one spinning `Redo` icon ([orders/[orderId]/page.tsx:65](../../apps/web/src/app/orders/[orderId]/page.tsx)), `skeleton` (8).
- **Alerts, two systems:** `ui/alert.tsx` (2 uses) vs hand-rolled `ui/banner.tsx` (2 uses) — banner is the single worst palette offender (16 raw colors) and duplicates alert with an info/warning/success/error map.
- **Headings, three systems:** `typography.tsx` (`text` prop, no `cn`), `.h1`–`.h4` classes in `globals.css`, and ~raw `<h1 className>` everywhere.
- **Toasts:** one system (sonner) — good — but `toaster.tsx` sets an invalid style (`borderRadius: 'border-radius-lg'`) and encodes success/error/warning/info as raw `!bg-green-100`-style overrides (#4 palette offender).
- **Raw elements:** 26 raw `<button>` (14 in `app/e/[eventId]/_components/` checkout flow), 2 raw `<input>` in `EmailAuthForm.tsx`.

## Drift counts (apps/web/src, .tsx)

~114 raw palette utilities + ~86 hex literals + 38 arbitrary `[#hex]` classes.

- Neutrals: `gray-` 34 + `slate-` 12 + `neutral-` 1 — three ramps against one token set (which is itself blue-tinted slate while `components.json` claims `baseColor: "neutral"`).
- Success-ish: `green-` 15 + `emerald-` 6 + `teal-` 3 — no `--success` token exists.
- `blue-` 16 (notably `EmailAuthForm.tsx` hardcoding `bg-blue-600` **on `<Button>`**, overriding indigo `--primary`), `red-` 12, `yellow-` 7, `orange-` 6.
- Worst files: `banner.tsx` (16), `EmailAuthForm.tsx` (12), `PublishRequirements.tsx` (11), `toaster.tsx` (10), organizer attendees page (8); hex: `flyers.tsx` (48), `hero.tsx` (29).
- Cream is still open: `discover/page.tsx` uses `bg-[#faf8f4]` while [ADR 0003](../adr/0003-indigo-canonical-brand.md) calls cream off-brand drift.

## Config findings

- `globals.css`: complete HSL token set (good) + full `.dark` set that nothing toggles + the inert v4 `@theme inline` block nested in `@layer base` + `.form-*` classes hardcoding `bg-white border-gray-300` inside the token file + hand-rolled `.line-clamp-*` (native since Tailwind 3.3).
- `tailwind.config.ts`: CommonJS despite the extension; stale content globs (`./emails/**`, `./pages/**`, `./components/**` — none exist); `accordion-down/up` keyframes for a component not in the repo; `--sidebar` var orphaned (config reads `--sidebar-background`).
- **Version bug, per tailwind-merge's own docs:** tailwind-merge 3.x is "for Tailwind v4.0 up to v4.3" and v3 users must use v2.6.0 — the repo runs 3.6.0 against pinned `tailwindcss` 3.3.3, so every `cn()` call goes through a merger built for the wrong class taxonomy. Fix now (pin `tailwind-merge@2.6.0`) or on v4 upgrade. Two Tailwind versions also coexist in the tree (3.3.3 nested, 3.4.19 hoisted from `apps/organizer`).
- `knip` script exists but no config — why the dead files went uncaught.
- Only `apps/web` has a `components.json`; no shared tokens package exists.

## Doc-verified upgrade facts (2026-08-01)

Registry versions: `tailwindcss` 4.3.3, `shadcn` CLI 4.16.1, unified `radix-ui` 1.6.7, `tw-animate-css` 1.4.0, `tailwind-merge` 3.6.0, `lucide-react` **1.28.0** (repo pins 0.503.0 — a major jump; check icon renames during the refresh).

From the [Tailwind upgrade guide](https://tailwindcss.com/docs/upgrade-guide): `npx @tailwindcss/upgrade` needs Node 20+, run on its own branch. Manual-attention renames: `shadow/rounded/blur` scales shift down (`shadow-sm`→`shadow-xs`, `shadow`→`shadow-sm`, `rounded`→`rounded-sm`), `ring` default 3px→1px, `outline-none`→`outline-hidden`, default border color gray-200→currentColor, important modifier moves to suffix (`!flex`→`flex!`), `bg-opacity-*`→slash syntax, variant stacking flips left-to-right. PostCSS: single `@tailwindcss/postcss` plugin, drop `autoprefixer`/`postcss-import`. JS config can survive via `@config`, but `corePlugins`/`safelist` are gone.

From [shadcn's Tailwind v4 guide](https://ui.shadcn.com/docs/tailwind-v4): no all-in-one migrate command; the path is the Tailwind codemod + shadcn's **`remove-forward-ref` codemod** + manual `data-slot`/`size-*` adoption; tokens lose their `hsl()` wrappers and move to `@theme inline` (OKLCH for new projects); `tailwindcss-animate` is deprecated for `tw-animate-css`. Old v3-era components **keep working** after the Tailwind upgrade — the refresh is a choice, not forced, but mixing eras means `shadcn add` output won't match on-disk components.

From the [Base UI announcement](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default): "You do not need to migrate. Radix is a mature, tested library" — every update ships for both bases. Existing `components.json` keeps `base: radix` (already resolved so in this repo); only non-interactive `shadcn init` needs `-b radix`.

## Recommendation — collapse the 7-phase plan to 4

1. **Shrink & clean (no visual change, independent, do first).** Remove antd end-to-end; delete the 7 unused primitives + 3 unused app files + 2 dead stylesheets + 5 Radix deps + `vaul`; fix stale config globs and dead keyframes; **pin `tailwind-merge@2.6.0`** (the documented pairing for Tailwind v3); configure knip. Migration surface drops 32 → 25 components before anything is rewritten.
2. **Tailwind v4 + shadcn refresh (one foundation PR).** The June plan sequenced "v4 first, components later"; since old components keep working under v4, the refresh could split out — but one PR avoids a mixed-era window where `shadcn add` emits incompatible components. Path: `@tailwindcss/upgrade` codemod, tokens to `@theme inline` (OKLCH, drop `hsl()` wrappers), re-pull the 25 kept primitives from the registry **staying on Radix base** (unified `radix-ui` package), `remove-forward-ref` codemod for any kept custom components, `tailwindcss-animate` → `tw-animate-css`, `tailwind-merge` → 3.x, `lucide-react` → 1.x, adopt the official `spinner`/`empty`. This natively fixes fonts, shadows, and the orphan block. Browser gate (Safari 16.4+/Chrome 111+/FF 128+) passed in the 2026-07 PostHog check (≈0.1% sub-baseline).
3. **Semantic color sweep.** Add `--success`/`--warning` tokens; migrate the ~114 utilities (banner→alert merge, toaster, auth forms, PublishRequirements first). Requires two owner decisions: is the homepage hex palette (#483) intentional brand direction, and does cream become a surface token or get fixed.
4. **Guardrail + typography.** Lint rule banning raw palette classes; one heading primitive, retire the other two systems.

Dark mode stays out (ADR 0002) — but the unused `.dark` block and 9 stray `dark:` variants should be deleted in step 3 rather than half-maintained.
