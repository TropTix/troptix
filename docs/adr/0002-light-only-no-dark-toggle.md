# 2. Stay light-only; keep tokens dark-ready but ship no dark-mode toggle

- **Status:** Accepted
- **Date:** 2026-06-02

## Context

`apps/web/src/styles/globals.css` defines a complete `.dark` token set, and various components use `dark:` Tailwind variants. But the app has no theme toggle, no `next-themes` provider, no system-preference detection, and ~570 hardcoded palette colors that would break dark surfaces anyway. So dark mode is half-built: full token surface area, zero shipped UX, and broken-looking dark surfaces if it were ever enabled.

We need to decide what the design-system standardization aims for: finish dark mode (build the toggle, make every surface dark-correct), drop it (remove the `.dark` tokens entirely), or hold.

## Decision

Stay light-only for now. The color migration onto semantic tokens proceeds and keeps surfaces *dark-ready* (because semantic tokens carry both light and dark values), but:

- No theme toggle, no `next-themes`, no system-preference detection.
- No new `dark:` variants; do not invest review time chasing dark-mode correctness.
- The `.dark` token set stays in `globals.css` as-is — pre-paid optionality. We don't remove it and we don't expand on it.

## Consequences

- The standardization work is smaller and ships faster — we don't have to make every page render correctly in dark mode.
- We can revisit dark mode later as a discrete project without re-doing the token work, because token-based components automatically respect whatever theme is mounted.
- The codebase still contains some `dark:*` variants in components that were authored speculatively. They're inert in production (no `.dark` class is mounted), so leaving them is harmless and removing them is not worth the churn now.
- Anyone shipping a one-off dark-themed surface (e.g., a marketing page) must use semantic tokens, not `dark:` variants, so it stays consistent with the rest of the app.
