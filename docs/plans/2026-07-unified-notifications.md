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

1. **Strict domain-semantic catalog.** A new `apps/web/src/lib/notify.ts` exports a single `notify` object whose methods name product events: `notify.eventPublished()`, `notify.attendeeCheckedIn()`, `notify.emailCopied()`. Every toast is a named method — no generic `notify.error(message)` escape hatch, and the catalog owns message formatting (e.g. `eventPublishBlocked(missing: string[])` builds its own title) so copy cannot be smuggled in from call sites. The module is the complete, reviewable vocabulary of everything the app can say via toast. Async flows (promo apply, contact form send) are domain methods that wrap `toast.promise` internally, replacing manual `loading`/`dismiss` pairs.
2. **Sonner stays direct-only inside the module.** ESLint `no-restricted-imports` bans `sonner` everywhere except `lib/notify.ts` and `components/toaster.tsx`; call sites pending migration carry a warn-severity override (not `off`, so the debt stays visible in every lint run and other restricted imports still apply) until PR 2 removes it.
3. **Tokens now, on v3.** Add `--success` and `--warning` as HSL channel vars in `globals.css`, wired into `tailwind.config.ts` exactly like `--destructive`. This pulls forward the design-system plan's "one additive token change"; the components migrate mechanically when Tailwind v4 lands.
4. **Neutral-surface severity language.** Toasts and Alerts use `bg-background text-foreground border-border` with severity carried by the icon color (`text-destructive` / `text-success` / `text-warning` / `text-primary`) — not tinted pastel fills. An inline Alert may use at most a soft tint (`bg-destructive/5`) where it needs more weight. Radius from `--radius`.
5. **Toaster behavior defaults.** Position mobile `top-center` / desktop `bottom-right` (unchanged); `closeButton` enabled. Durations are internal presets in `notify.ts` (roughly: success/info short, warning/error long); raw millisecond `duration` is not part of any public API surface.
6. **One Alert primitive; Banner deleted.** Extend `alert.tsx` to CVA variants `default | destructive | success | warning | info`, add optional `onDismiss` (renders the X) and a default lucide icon per variant (overridable). `role="alert"` only for `destructive`/`warning`; `role="status"` otherwise. Delete `banner.tsx`; its 4 call sites (PaidWarningBanner ×2, EventDetails, EventPageClean) compose Alert, with "banner-ness" (full-width, page-top) as layout at the call site.
7. **Owned-surface rule (toast vs inline).** _If the outcome is durable page state the user is already looking at, or must act on in place, render it inline — never a toast. Toasts are only for transient feedback on actions with no dedicated surface, or that navigate away._ Written as a doc comment atop `lib/notify.ts`. Consequences:
   - Order confirmation page: inline `StatusDisplay` only; its toast barrage is deleted.
   - Payment failures render inline (destructive Alert) within the new CheckoutSheet; toasts are not used for payment outcomes. This is a requirement recorded in the checkout redesign plan — implementing it is that initiative's work, not this one's.
   - Promo apply, availability, RSVP, contact form, clipboard copy, check-in toggle: toasts. Submit-then-navigate outcomes (event/ticket created): toasts.
8. **Legacy tree resolved by deletion.** The legacy `/events/[eventId]` checkout — and `hooks/useCheckout.tsx`, its only dependent — was deleted on main (#416) while PR 1 was in review, taking its ~25 call sites with it. No exemption or migration needed. Living surfaces migrate (~8 files): auth forms, organizer event/ticket forms, AttendeeTable, confirmation page, contact form, cta, event-management-nav.
9. **Dev catalog page.** `/dev/notifications` — hardcoded buttons calling every real `notify.*` method (grouped by domain) plus all Alert variants side by side. Gated structurally by a route-group layout (`src/app/dev/layout.tsx`) that 404s production deployments while staying reachable locally and on Vercel previews — where copy review actually happens. Doubles as a copy-review surface. Updated by convention, not lint. Delete `toast-tester.tsx`.

## Phases

**PR 1 — Foundation.** `--success`/`--warning` tokens; Toaster restyle; `lib/notify.ts` with the full catalog for living call sites; ESLint ban with a warn-severity override for pending call sites; `/dev/notifications`; delete `toast-tester.tsx`. Shippable alone — nothing breaks; unmigrated code lints as warnings.

**PR 2 — Migration.** Move the living files to `notify.*` and delete the warn override; de-toast the confirmation page (inline `StatusDisplay` becomes the sole surface); drop `EventForm`'s validation toast in favor of its inline `FormMessage` errors (owned-surface rule).

**PR 3 — Alert consolidation.** Refreshed Alert primitive (variants, dismiss, icons, roles); delete `banner.tsx` and migrate its call sites; annotate the design-system plan (Phase 3 partial / Phase 5 landed early) and the checkout-redesign plan (inline payment-failure requirement).

## Verification

- `cd apps/web && yarn typecheck && yarn build` clean per PR; `yarn lint` introduces no new errors (pre-existing react-hooks failures are tracked in #418).
- ESLint: a direct `import { toast } from 'sonner'` outside the allowed files fails lint; in pending-migration files it reports as a warning until PR 2.
- `/dev/notifications` in `next dev`: every catalog method fires a correctly styled toast; all Alert variants render; the route 404s in production deployments and local production builds, and renders on Vercel previews.
- Visual smoke: auth error toast, organizer event-create success, promo-code apply (promise flow), confirmation page shows inline status with zero toasts, PaidWarningBanner renders via Alert.
- After PR 2: `grep -rn "from 'sonner'" apps/web/src --include='*.tsx'` returns only `lib/notify.ts` and `components/toaster.tsx`.

## Out of scope

- The legacy `/events/[eventId]` tree (deleted upstream via #416).
- Implementing the new checkout's inline payment-failure UX (requirement handed to the checkout redesign plan).
- Mobile apps (`apps/organizer` uses gluestack toast; `apps/organizer-v2` has none).
- Storybook or any component-workbench dependency.
- Dark mode (per ADR 0002); app-level announcement system (dismiss-and-remember banners) — a future component if ever needed.

## Open items (resolve during implementation)

- ~~`useCheckout.tsx` liveness~~ — resolved: legacy-only, deleted with the tree (#416).
- Exact `--success` / `--warning` hues (green/amber families tuned against the indigo/neutral palette) — PR 1 shipped green-600 / amber-600; revisit if they clash.
- Final duration preset values — PR 1 shipped errors 8s, everything else sonner's 4s default.
