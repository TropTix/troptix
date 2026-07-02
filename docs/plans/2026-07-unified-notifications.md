---
title: Unified Notifications — notify catalog, Toaster restyle, Alert consolidation
status: active
created: 2026-07-02
tracking-issue: '#414'
---

# Unified Notifications

Unify how `apps/web` surfaces in-app notifications: one strict domain-semantic toast catalog over sonner, a token-based restyle of the Toaster, consolidation of `Alert` + `Banner` into a single refreshed primitive, and a written rule for toast-vs-inline.

Related docs: this pulls forward pieces of the [design-system standardization plan](2026-06-design-system-standardization.md) (Phase 3's `--success`/`--warning` tokens, Phase 5's alert variants) and hands one UX requirement to the [checkout redesign](2026-06-checkout-redesign.md).

## Context

Sonner (v2.0.3) is already the sole toast library — 58 call sites across 13 files, mounted via `apps/web/src/components/toaster.tsx`. But there is no unification layer, and it shows:

- **No abstraction.** Every file imports `toast` from `sonner` directly and makes its own choices about copy, duration, and ids. Result: three different "An unexpected error occurred…" strings, ad-hoc loading/dismiss bookkeeping, and a `duration: 3` bug in the old payment form (sonner takes milliseconds — the payment-failure toast lives for 3ms).
- **Broken Toaster styling.** `toaster.tsx` uses `!important` Tailwind overrides with raw palette colors (`!bg-green-100`), and `borderRadius: 'border-radius-lg'` is an invalid CSS value, silently ignored.
- **Duplicate surfaces.** The order confirmation page fires ~10 toasts _and_ renders an inline `StatusDisplay` Alert for the same payment outcome.
- **Two overlapping primitives.** `components/ui/banner.tsx` is a hand-rolled dismissible Alert with the same four severities as `alert.tsx`, in tinted-pastel styling that fights the token system. `alert.tsx` hardcodes `bg-blue-50 text-black` for its `info` variant and puts `role="alert"` on every severity.
- **Dead code.** `_components/toast-tester.tsx` has no importers.

The new `/e/[eventId]` page and its checkout (`CheckoutSheet`, `ContactStep`, `SelectStep`) currently use zero toasts; the legacy `/events/[eventId]` tree — which contains ~25 of the 58 call sites, including all the payment-form ones — is scheduled for deletion once the new checkout ships.

## Decisions

1. **Strict domain-semantic catalog.** A new `apps/web/src/lib/notify.ts` exports a single `notify` object whose methods name product events: `notify.paymentFailed(err)`, `notify.checkInUpdated()`, `notify.promoApplied(msg)`, `notify.emailCopied()`. Every toast is a named method — no generic `notify.error(message)` escape hatch. The module is the complete, reviewable vocabulary of everything the app can say via toast. Async flows (promo apply, contact form send) are domain methods that wrap `toast.promise` internally, replacing manual `loading`/`dismiss` pairs.
2. **Sonner stays direct-only inside the module.** ESLint `no-restricted-imports` bans `sonner` everywhere except `lib/notify.ts` and `components/toaster.tsx`, with a scoped exemption for `src/app/events/**` until that tree is deleted.
3. **Tokens now, on v3.** Add `--success` and `--warning` as HSL channel vars in `globals.css`, wired into `tailwind.config.ts` exactly like `--destructive`. This pulls forward the design-system plan's "one additive token change"; the components migrate mechanically when Tailwind v4 lands.
4. **Neutral-surface severity language.** Toasts and Alerts use `bg-background text-foreground border-border` with severity carried by the icon color (`text-destructive` / `text-success` / `text-warning` / `text-primary`) — not tinted pastel fills. An inline Alert may use at most a soft tint (`bg-destructive/5`) where it needs more weight. Radius from `--radius`.
5. **Toaster behavior defaults.** Position mobile `top-center` / desktop `bottom-right` (unchanged); `closeButton` enabled. Durations are internal presets in `notify.ts` (roughly: success/info short, warning/error long); raw millisecond `duration` is not part of any public API surface.
6. **One Alert primitive; Banner deleted.** Extend `alert.tsx` to CVA variants `default | destructive | success | warning | info`, add optional `onDismiss` (renders the X) and a default lucide icon per variant (overridable). `role="alert"` only for `destructive`/`warning`; `role="status"` otherwise. Delete `banner.tsx`; its 4 call sites (PaidWarningBanner ×2, EventDetails, EventPageClean) compose Alert, with "banner-ness" (full-width, page-top) as layout at the call site.
7. **Owned-surface rule (toast vs inline).** _If the outcome is durable page state the user is already looking at, or must act on in place, render it inline — never a toast. Toasts are only for transient feedback on actions with no dedicated surface, or that navigate away._ Written as a doc comment atop `lib/notify.ts`. Consequences:
   - Order confirmation page: inline `StatusDisplay` only; its toast barrage is deleted.
   - Payment failures render inline (destructive Alert) within the new CheckoutSheet; toasts are not used for payment outcomes. This is a requirement recorded in the checkout redesign plan — implementing it is that initiative's work, not this one's.
   - Promo apply, availability, RSVP, contact form, clipboard copy, check-in toggle: toasts. Submit-then-navigate outcomes (event/ticket created): toasts.
8. **Legacy tree untouched.** The ~25 call sites under `src/app/events/[eventId]/` are not migrated — they die with the page. Only living surfaces migrate (~8 files): auth forms, organizer event/ticket forms, AttendeeTable, confirmation page, contact form, cta, event-management-nav, and `hooks/useCheckout.tsx` _if_ it survives into the new flow (check at implementation time).
9. **Dev catalog page.** `/dev/notifications` — hardcoded buttons calling every real `notify.*` method (grouped by domain) plus all Alert variants side by side; `notFound()` in production. Doubles as a copy-review surface. Updated by convention, not lint. Delete `toast-tester.tsx`.

## Phases

**PR 1 — Foundation.** `--success`/`--warning` tokens; Toaster restyle; `lib/notify.ts` with the full catalog for living call sites; ESLint ban + legacy exemption; `/dev/notifications`; delete `toast-tester.tsx`. Shippable alone — nothing breaks; old code keeps working under the exemption.

**PR 2 — Migration.** Move the living files to `notify.*`; de-toast the confirmation page (inline `StatusDisplay` becomes the sole surface); resolve `useCheckout` (migrate or leave-to-die).

**PR 3 — Alert consolidation.** Refreshed Alert primitive (variants, dismiss, icons, roles); delete `banner.tsx` and migrate its call sites; annotate the design-system plan (Phase 3 partial / Phase 5 landed early) and the checkout-redesign plan (inline payment-failure requirement).

## Verification

- `cd apps/web && yarn typecheck && yarn lint && yarn build` clean per PR.
- ESLint: a direct `import { toast } from 'sonner'` outside the allowed files fails lint; the same import under `src/app/events/**` passes.
- `/dev/notifications` in `next dev`: every catalog method fires a correctly styled toast; all Alert variants render; the route 404s in a production build.
- Visual smoke: auth error toast, organizer event-create success, promo-code apply (promise flow), confirmation page shows inline status with zero toasts, PaidWarningBanner renders via Alert.
- `grep -rn "from 'sonner'" apps/web/src --include='*.tsx'` returns only `lib/notify.ts`, `components/toaster.tsx`, and legacy `app/events/**` files.

## Out of scope

- The legacy `/events/[eventId]` tree (deleted by the checkout cutover, not this initiative).
- Implementing the new checkout's inline payment-failure UX (requirement handed to the checkout redesign plan).
- Mobile apps (`apps/organizer` uses gluestack toast; `apps/organizer-v2` has none).
- Storybook or any component-workbench dependency.
- Dark mode (per ADR 0002); app-level announcement system (dismiss-and-remember banners) — a future component if ever needed.

## Open items (resolve during implementation)

- `useCheckout.tsx` liveness — shared with the new checkout or legacy-only?
- Exact `--success` / `--warning` hues (green/amber families tuned against the indigo/neutral palette).
- Final duration preset values.
