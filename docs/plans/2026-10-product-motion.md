---
title: Product motion: six picks from the motion review
status: active
created: 2026-10-29
tracking-issue: #640
---

# Product motion: six picks from the motion review

## Why

The product's waits, blanks and wins are static. Steps hard-cut, the pay
button flips between labels, the hold is a bare timer, skeletons pulse in
unison, and the empty orders page is an icon in a circle. A review on
2026-10-29 built forty-two candidates as live demos and picked six that
belong inside the existing components, in the product's own colours and
copy. This plan turns those six into six small PRs.

The chosen six, as live demos: <https://claude.ai/artifact/1TmUh8KgD8cPQcsTgQx6b5>.
The full review, with everything that was not chosen: <https://claude.ai/artifact/VfRm6bfszdTbyWcVaQbmgJ>.

## Scope

Each item names the screen, the behaviour, and the files it touches.

1. **Stepper roll** (`SelectStep`). The quantity rolls like a counter wheel
   when it changes, up for plus and down for minus, with a touch of blur. The
   tickets-left figure counts down in step. The total rolls the same way. The
   stepper's existing entrance at the first tap stays.
2. **Hold pill** (`PaymentStep`). The hold becomes a pill in the step header
   with a ring that drains with the time left. Under a minute it turns red and
   nudges on each tick. At zero it reads Expired. Replaces the bare
   "Held for m:ss" text from #620, keeping its tabular digits.
3. **Pay button** (`PaymentStep`). On press the label blurs out and the
   button collapses to a ring that fills while Stripe confirms. On success it
   turns green, draws a check and reads Paid before the sheet moves on. On a
   decline it returns to full width with a short shake and the error reads
   below, as today. Covers the pay button part of #533.
4. **Directional step transitions** (`CheckoutSheet`). Select, contact and
   payment slide as one flow: forward enters from the right while the old
   step drifts left and dims, back reverses it. Interruptible through
   `AnimatePresence`. Implements #534 as specified there.
5. **Skeleton stagger and handoff** (`Skeleton`, `orders/loading.tsx`, the
   orders list). Skeleton cards pulse in a wave, delayed by their index. When
   the data lands, each real card rises into place a beat after the last and
   the skeleton blurs away under it.
6. **Ghost cards** (`orders/page.tsx`). The empty orders page is drawn with
   three dashed ghosts of the order card that slowly shuffle, above the same
   copy and button as today.

## Out of scope

The other thirty-six candidates stay in the review for later. The success
screen (#535) and the other checkout CTAs in #533 are not touched here.

## Conventions

- Client components animate with `motion` (already installed; the global
  `MotionConfig` honours the user's reduced-motion setting). Server
  components, including every `loading.tsx`, use CSS keyframes in
  `globals.css` with a `prefers-reduced-motion` block, as `cta-shake` does.
- Transform and opacity only. Interactions stay under 300ms; only idle loops
  run longer.
- Easing is the strong ease-out `cubic-bezier(0.23, 1, 0.32, 1)` for
  entrances and `cubic-bezier(0.77, 0, 0.175, 1)` for on-screen movement.
  #630 adds these to the theme as `ease-out-strong` and the `duration-*`
  scale; until it lands the PRs write the same values inline and switch to
  the tokens in a follow-up.
- Reduced motion keeps fades and colour changes and drops movement.

## PR sequence

Each PR is independent of the others and based on `main`. They are listed in
the order a buyer meets them.

| PR  | Files                                                   | Closes      |
| --- | ------------------------------------------------------- | ----------- |
| 1   | `SelectStep.tsx`                                        |             |
| 2   | `PaymentStep.tsx` (header)                              |             |
| 3   | `PaymentStep.tsx` (button), `globals.css`               | #533 (part) |
| 4   | `CheckoutSheet.tsx`                                     | #534        |
| 5   | `skeleton.tsx`, `orders/loading.tsx`, `orders/page.tsx` |             |
| 6   | `orders/page.tsx`                                       |             |

PRs 2 and 3 touch different regions of the same file and merge cleanly in
either order. #627 and #624 are open against `SelectStep` and the sheet, so
PRs 1 and 4 may need a small rebase.

## Verification

Every PR runs `pnpm --filter web typecheck`, `pnpm lint` and
`pnpm --filter web test`. The checkout PRs also run the browser suite in
`e2e/`.

Each PR description carries a recording of the change in the real app, made
with the e2e harness: the production build, the fake Stripe, and for the
orders page a fake auth server that answers the one call the app makes to
verify a session. The recordings live on the `media` branch, which holds no
code.
