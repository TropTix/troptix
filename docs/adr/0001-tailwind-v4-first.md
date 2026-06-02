# 1. Upgrade Tailwind to v4 before the design-system color sweep

- **Status:** Accepted
- **Date:** 2026-06-02

## Context

`apps/web` runs Tailwind v3.3.3, but `apps/web/src/styles/globals.css` already contains a partially-applied v4 setup — a `@theme inline { … }` block sits in the file doing nothing (v3 ignores it). The block is a v4-shadcn token paste authored against the v4 CSS-first config model. Several practical consequences:

- The shadow tokens (`--shadow-*`) and font variables defined in `globals.css` are never wired into the v3 JS config, so `shadow-md` / `font-sans` resolve to Tailwind defaults rather than the intended values.
- Inter is loaded via `next/font` but applied via the class `font-inter`, which Tailwind never generates (no `fontFamily.inter` in the v3 config) — Inter likely isn't actually rendering.
- The planned design-system standardization needs to consolidate ~570 raw palette colors onto semantic tokens; doing that on v3 means later redoing the foundation on v4.

We considered three paths: stay on v3 and hand-wire fonts/shadows into the JS config; do the color sweep on v3 then upgrade later; or upgrade first.

## Decision

Upgrade to Tailwind v4 as the foundation of the design-system standardization, in its own PR, before the color migration. Move the theme config from `tailwind.config.ts` into CSS-first `@theme`, swap to `@tailwindcss/postcss`, replace `tailwindcss-animate` with `tw-animate-css`, and sweep the v4 utility renames (`shadow` → `shadow-sm`, `outline-none` → `outline-hidden`, opacity → slash syntax, `ring` default width, etc.). Use the official codemod (`npx @tailwindcss/upgrade`) as the starting point.

Gate the upgrade on a browser-baseline check: v4 requires Safari 16.4+ / Chrome 111+ / Firefox 128+ (it uses `@property` and `color-mix()`). Confirm via PostHog that buyer browser mix supports this baseline on the checkout flow before committing.

## Consequences

- The orphan `@theme inline` block becomes the real config; the latent font and shadow tokens come online without any throwaway hand-wiring on v3.
- The color-token sweep is built on the final system, not a legacy version we'd later re-migrate.
- We accept v4's modern-browser baseline as a constraint for the consumer checkout flow, validated against analytics.
- Token CSS variable format needs to be decided once during the upgrade: keep raw HSL channels and wrap inside `@theme` (`hsl(var(--primary))`), or convert to full HSL / OKLCH values (v4-shadcn default). We pick OKLCH or full HSL for cleanliness.
- Future Tailwind upgrades (v5+) are easier from v4 than from v3.
