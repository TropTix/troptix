# 27. Event pages may be themed from the flyer, chosen by the organizer

- **Status:** Accepted
- **Date:** 2026-07-28

## Context

Every public event page rendered in the same brand indigo, no matter whose
event it was. Organizers put their identity into the flyer; the page around it
stayed ours. A prototype (PR #479) tested three treatments on real events and
settled the design questions: raw flyer colors are unusable (organizer art is
neon-on-neon, clashing, or grayscale), so any theming must run extracted colors
through fixed guardrails; and checkout must not inherit the party's colors.

This decision narrows two earlier ones for the public event page only:

- [ADR 0002](0002-light-only-no-dark-toggle.md) (light-only): an organizer may
  now choose a dark treatment for their event page. The rest of the app stays
  light-only; this is per-event content styling, not a viewer dark mode.
- [ADR 0003](0003-indigo-canonical-brand.md) (indigo `--primary`): on a themed
  event page, `--primary` and `--ring` derive from the flyer. Everywhere else —
  including the global nav and the checkout sheet rendered _over_ a themed
  page — indigo remains canonical.
- The event-page redesign plan's "clean light, halo not wash" decision stands
  as the default (`off`); wash and dark are organizer opt-ins layered on it.

## Decision

- Organizers choose one of three fixed treatments at create/edit — **Classic /
  Tinted wash / Poster dark** — never individual colors. The system owns
  contrast.
- The flyer's palette is extracted **once, client-side, at upload** (canvas
  pixel sampling) and stored raw on the event (`Events.flyerPalette`, hex
  strings) beside the choice (`Events.pageTheme`). The public page does no
  image work at render time.
- Tokens are **derived in code** from the stored palette on every render
  (`apps/web/src/lib/flyerTheme.ts`) — storing the palette rather than derived
  tokens lets the derivation improve without a data backfill. The derivation
  guarantees WCAG ratios (body ink ≥12:1; muted text ≥4.6:1 on every emitted
  surface; CTA label ≥4.5:1; CTA fill and ring ≥3:1 vs the ground), enforced by
  `flyerTheme.test.ts`.
- The theme applies as CSS-variable overrides on a wrapper **scoped to the
  event page**. The global nav and the portaled checkout sheet stay on brand
  tokens: the flyer sells the party; the money screens sell trust.
- Every failure path — no palette, grayscale flyer, malformed stored JSON,
  CORS-blocked extraction — degrades to the brand theme, never a broken page.

## Consequences

- Event pages can look like the organizer's event, at zero render-time cost
  and with contrast the organizer cannot break.
- Two schema columns exist with no backfill: pre-existing events show an
  "analyze flyer" affordance in the edit form instead of silently disabled
  options. Legacy flyers on hosts without CORS headers cannot be analyzed
  in-browser; those events need a re-upload (or a future server-side
  extraction) to opt in.
- The derivation is HSL with a lightness-walking contrast solver — good
  enough under test; an OKLCH version can replace it without touching stored
  data.
- Anything rendered inside the event page wrapper must use the design tokens;
  hardcoded colors will not follow the theme (this is how the bottom bar's
  inherited text color bug happened).
