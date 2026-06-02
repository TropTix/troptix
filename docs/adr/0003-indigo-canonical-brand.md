# 3. Indigo `--primary` is the canonical brand color

- **Status:** Accepted
- **Date:** 2026-06-02

## Context

The semantic token `--primary` is indigo (`238.73 83.53% 66.67%`) and is used throughout the shadcn component library — buttons, focus rings, badges, alerts. However the landing surfaces have drifted off-brand:

- `apps/web/src/app/_components/hero.tsx` and `cta.tsx` use a cream background (`#faf8f4`, `#f7f4ec`) for the editorial hero.
- `apps/web/src/styles/ant.css` styles the Ant Design carousel dots magenta (`#ff4ef6`).

These were introduced via design iteration without being reconciled with the token-based primary. The standardization needs a single canonical brand identity to migrate onto.

## Decision

Treat indigo `--primary` as the canonical brand color. The landing-page cream and the carousel magenta are off-brand drift to consolidate, not parallel brand directions to preserve. Specifically:

- Buttons, CTAs, focus rings, primary actions, and brand accents resolve to `--primary` (indigo).
- The landing cream becomes either `background` / `muted` if it's incidental warmth, or a named `--surface-warm` token *only* if a warm hero is an intentional brand zone — that decision is made during the hero migration, not assumed in advance.
- The carousel magenta is purely off-brand and is removed alongside the Ant Design removal.

## Consequences

- One brand color across the product reduces visual noise and simplifies future palette decisions.
- The cream hero will visually shift toward indigo brand identity; that may or may not be the right direction. If the warmth is intentional, capturing it as a token is fine; if not, the hero gets re-skinned during the color migration phase.
- Future re-brands change one token, not hundreds of usages.
- Marketing/landing surfaces are explicitly *not* exempt from token discipline.
