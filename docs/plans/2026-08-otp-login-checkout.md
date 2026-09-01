---
title: Sign-in required at checkout, OTP embedded in the sheet
status: proposed
created: 2026-08-17
tracking-issue: TBD
---

# Sign-in required at checkout, OTP embedded in the sheet

## Goal

Every ticket purchase belongs to an account. A signed-out buyer signs in (or
implicitly signs up) without leaving the checkout sheet, via the existing
email-plus-6-digit-code flow. Browsing and event pages stay public.

## Why now

Guest checkout (ADR 0007 / checkout redesign plan, "accounts-required checkout:
deferred") links orders to future accounts only by a free-typed email. That is
fragile:

- A typo'd email orphans the order and misdelivers tickets.
- `/orders` matches by email ([apps/web/src/app/orders/page.tsx](../../apps/web/src/app/orders/page.tsx)), so a mismatch hides purchases.
- Attendee order pages stay bearer-token-by-URL (ADR 0022) partly because an
  order may belong to no account.

The known risk was funnel drop-off from a login redirect. Embedding the OTP
step in the sheet removes the redirect: the page never unloads, so the ticket
selection survives.

## Current state (verified)

- Checkout is a client step machine in
  [CheckoutSheet.tsx](../../apps/web/src/app/e/%5BeventId%5D/_components/CheckoutSheet.tsx):
  `select → contact → payment → finalizing → success | expired | refunded`.
- All checkout tRPC procedures are `publicProcedure`
  ([checkout.ts](../../packages/api/src/trpc/routers/checkout.ts)); a guest
  authorizes by possession of the unguessable `reservationId`.
- `Reservation.userId` is nullable; `createReservation` takes
  `userId: string | null` from the actor.
- The OTP flow already exists:
  [EmailAuthForm.tsx](../../apps/web/src/app/auth/_components/EmailAuthForm.tsx)
  (`signInWithOtp` → `verifyOtp`, resend cooldown, autofill decoys), used by
  the signin/signup pages. `protectedProcedure` exists in
  [trpc.ts](../../packages/api/src/trpc/trpc.ts) and is unused by checkout.
- The actor reaches tRPC via session cookie; `AuthProvider` hydrates `user`
  from `/api/user/me` on every auth state change.
- No mobile or organizer app calls the checkout procedures — web only.

## Design decisions

1. **Gate at reservation creation only.** `checkout.createReservation` becomes
   a `protectedProcedure`; the service takes a required `userId`. The post-hold
   procedures (`completeFree`, `beginPayment`, `getCheckoutState`, `release`)
   keep possession-based authorization — the resume path after the Stripe
   redirect must finalize even if the session cookie is gone, and holds can now
   only be created by signed-in users anyway.
2. **The contact email is the account's email, derived server-side.** The
   client stops sending an email; `reservationContactSchema` shrinks to names
   only, and the service reads the buyer's `Users.email` (lowercased — the
   linkage invariant). This turns the email linkage key into an authenticated
   fact instead of a typed one. UI shows the email read-only on the contact
   step.
3. **OTP only inside the sheet — no Google button there.** An OAuth redirect
   unloads the page and loses the selection. The auth pages keep Google.
4. **Auth step placement: after ticket selection, before contact.** The buyer
   invests in a selection first; no hold exists yet, so OTP wait time burns no
   inventory hold.
5. **Email-first branch** (design review, 2026-08-25; prototype variant D).
   The buyer enters an email and the sheet checks whether an account exists:
   - **Existing account** → "Welcome back" + the 6-digit code straight away.
   - **New email** → an in-sheet "Create your account" step collecting first
     and last name (email echoed with a change link), then the code to confirm
     the address. Email, first name, and last name are the only fields —
     nothing else is collected.
     This needs a public email-lookup endpoint. That is account enumeration by
     design (the branch is the product experience, as on most commerce
     checkouts); accept it for v1 and lean on Supabase's OTP rate limits.
6. **Signup names are saved to the account, and checkout prefills from it.**
   Names entered at signup are held client-side and written to the `Users` row
   once the session is established. The contact step arrives with first/last
   name prefilled (from the fresh signup or the existing profile) and
   editable; the email is fixed to the account. For a returning buyer with a
   complete profile the contact step is a confirm-and-continue.
7. **Advance on session hydration, not on the verify call resolving.** The
   sheet moves on when `useAuth()` delivers a user. That guarantees the server
   will see a user actor on `createReservation` (the same cookies feed
   `/api/user/me` and tRPC), and it also catches a magic-link click completed
   in another tab. Pending signup names are flushed on the same signal.
8. **No schema change.** `Reservation.userId` stays nullable for historic
   guest rows; no migration, no backfill, no seed.sql change. Old orders keep
   matching by email. `Users.firstName/lastName` already exist.
9. **First purchase = explicit-feeling signup, mechanically still OTP.**
   `signInWithOtp` creates the auth user and the provisioning trigger creates
   the `Users` row (ADR 0015) for both branches; the "Create your account"
   step is presentation plus the name capture, not a separate auth path.

## Implementation

One PR. Steps in dependency order:

### packages/api

- [contracts/reservations.ts](../../packages/api/src/contracts/reservations.ts):
  drop `email` from `reservationContactSchema` (names only). Update
  [contracts/reservations.test.ts](../../packages/api/src/contracts/reservations.test.ts)
  (its four tests all exercise the removed email transform) to cover name
  trimming/rejection instead.
- [services/reservations.ts](../../packages/api/src/services/reservations.ts):
  `createReservation(prisma, input, userId: string)` — required. Fetch
  `Users.email` (`findUniqueOrThrow`), pass
  `contact: { ...input.contact, email: buyer.email.toLowerCase() }` into
  `reserve()`. `reserve()` itself is unchanged (its flexible contact shape
  still serves tests and the settle path).
- [trpc/routers/checkout.ts](../../packages/api/src/trpc/routers/checkout.ts):
  `createReservation` → `protectedProcedure`, pass `ctx.actor.userId`; update
  the header comment (reads public; create requires sign-in; post-hold stays
  possession-based).
- **New `user.emailHasAccount` public query** (input: email, output: boolean)
  — a `Users.email` unique lookup on the lowercased address. Drives the
  existing-vs-new branch in the sheet.
- **New `user.completeProfile` protected mutation** (`{ firstName, lastName }`
  → update the caller's `Users` row). Called once after a new signup's session
  lands; also lets `/api/user/me` serve the names for contact prefill.
- [contracts/analytics.ts](../../packages/api/src/contracts/analytics.ts): add
  `checkoutSignInRequired: 'checkout_sign_in_required'`; note `auth` in the
  `checkoutAbandoned` comment. Tag the sign-in-required capture with
  `is_new_account` once the branch resolves, so funnel drop-off is measurable
  per branch.
- [services/reservations.test.ts](../../packages/api/src/services/reservations.test.ts):
  the five `createReservation` call sites pass `TEST_OWNER_ID` instead of
  `null` and drop contact emails; add an assertion that the hold stores the
  owner's `userId` + account email.

### apps/web

- **Extract the OTP flow** from `EmailAuthForm` into
  `src/components/auth/EmailOtpFlow.tsx` with props
  `{ onVerified, submitLabel?, redirectPath?, emailStepPrelude? }`.
  `EmailAuthForm` becomes a thin wrapper: Google button + divider as the
  prelude, `onVerified` → `router.push('/')`. The signin/signup pages don't
  change.
- [lib/supabaseAuth.ts](../../apps/web/src/lib/supabaseAuth.ts):
  `signInWithMagicLink(email, redirectPath?)` appends `next=` to the callback
  URL so the emailed magic link lands back on the event page (the callback
  route already validates `next` as same-origin).
- **New `AuthStep.tsx`** in the event `_components`: sheet-style header (back
  → select) and the email-first machine —
  `email → (lookup) → code` for existing accounts,
  `email → (lookup) → signup names → code` for new ones — with
  `redirectPath=/e/<eventId>` on the emailed link and a "Signing you in…"
  spinner after verify while the session hydrates. Signup names are held in
  state and flushed via `user.completeProfile` when the session lands (works
  for the magic-link-in-another-tab case too). The layout matches prototype
  variant D.
- [CheckoutSheet.tsx](../../apps/web/src/app/e/%5BeventId%5D/_components/CheckoutSheet.tsx):
  add `'auth'` to the `Step` union + `STEP_TITLE`; select's continue goes to
  `contact` when signed in, else captures `checkout_sign_in_required` and goes
  to `auth`; an effect advances `auth → contact` when `user` lands; count
  `auth` as mid-funnel abandonment on close.
- [ContactStep.tsx](../../apps/web/src/app/e/%5BeventId%5D/_components/ContactStep.tsx):
  email field becomes a read-only display of the account email (new `email`
  prop); hint copy says tickets go to the account email; names stay editable
  and prefill from the profile (fresh signup names included).

### Docs

- ADR 0025 "Checkout requires a signed-in user, with OTP sign-in inside the
  sheet" — the decision, and that it supersedes the guest-checkout stance in
  the checkout redesign plan.

## Edge cases

- **Resume path (`?reservation=`)**: unchanged — jumps straight to
  `finalizing`, which is possession-based. Works even signed out.
- **Magic link clicked in another tab**: that tab lands on the event page
  signed in (no selection); the original tab's sheet advances via the
  cross-tab auth broadcast and flushes any pending signup names from there.
- **Existing account with no stored names** (pre-gate signups): the lookup
  says "existing", so no name capture — the contact step's empty name fields
  collect them exactly as today.
- **Buyer types a fresh email, then abandons at the code**: `signInWithOtp`
  has already created the auth user + `Users` row, but with no names and no
  order — harmless, and the next attempt branches to "existing".
- **Session dies mid-sheet** (sign-out elsewhere): `createReservation` returns
  UNAUTHORIZED, surfaced by the existing error banner.
- **Already signed in**: select → contact directly; nothing changes.
- **`user` still hydrating when the sheet opens**: worst case the auth step
  flashes and the effect immediately advances.

## Testing

- Unit/integration: updated contracts + reservations service tests (the
  service suite needs the real Postgres per its header; run against a preview
  branch).
- Manual on the PR preview: signed-out free RSVP, signed-out paid purchase
  (OTP mid-sheet, Stripe redirect, resume), signed-in purchase, back/abandon
  from the auth step, resend + wrong-code paths.
- The checkout E2E suite (PR #517) asserts guest checkout today; it will need
  a sign-in fixture once both land — coordinate whichever merges second.

## Open questions

1. **Feature flag?** This adds a gate to the revenue funnel. We could ship
   behind a PostHog flag (registry pattern, ADR 0023 releases) with the gate
   off, then flip after checking `checkout_sign_in_required` volume. Cost: the
   flag has to keep both the public and protected procedure paths alive, which
   doubles the server-side surface. Recommendation: ship without a flag —
   the change is small, reversible by revert, and instrumented.
2. **Buying for someone else.** Locking delivery to the account email removes
   "send tickets to my friend's inbox". Acceptable for v1 (forward the
   confirmation)? A later "recipient email" field could reintroduce it without
   touching the linkage key.
3. **Follow-up, not in scope**: revisit ADR 0022 (order pages could become
   account-scoped for new orders), and an account-claim pass for historic
   guest orders.

## Status note

A full implementation draft of exactly this plan exists in this worktree's
git stash (`otp-login-checkout implementation draft`), unverified (no
typecheck/test run yet). Restore with `git stash pop` after plan approval, or
discard and reimplement from this doc.
