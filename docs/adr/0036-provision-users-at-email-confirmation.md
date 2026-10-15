# 36. Provision app users at email confirmation, and never block the login

- **Status:** Accepted
- **Date:** 2026-10-15
- **Amends:** [ADR 0015](0015-passwordless-auth-and-trigger-provisioning.md) — its trigger fired `after insert on auth.users`; it now fires on email confirmation. The rest of 0015 (trigger over app code, link-or-create by email, decoupled `authUserId`) stands.

## Context

ADR 0015 provisioned `public."Users"` from an `after insert on auth.users` trigger. Supabase's `signInWithOtp` inserts the `auth.users` row when the email is _requested_, before anyone proves they own the address. Two problems followed:

1. Every unverified or bot request created a `"Users"` row. The table filled with junk accounts (#405).
2. The link step set `authUserId` on an existing `"Users"` row whose email matched. A stranger could request a code for someone else's email and claim that account's row before verifying anything.

The function also threw on a taken email or any other error. The trigger runs inside the auth write, so a throw rolled back the `auth.users` row and blocked the login (#323).

## Decision

1. **The trigger fires on confirmation.** It runs `after insert or update of email_confirmed_at on auth.users` with `when (new.email_confirmed_at is not null)`. OAuth signups arrive confirmed and provision at insert. Email OTP users provision when they verify. An OTP request that is never verified creates no `"Users"` row and links nothing.
2. **The function is idempotent.** It returns early when a `"Users"` row already carries this `authUserId`, so a confirmation that fires more than once does not double-create.
3. **The function never throws.** The create step uses `insert ... on conflict do nothing`, a taken email raises a warning, and a catch-all `exception` block warns and returns `new`. The cause lands in the Postgres logs; the login goes through.

## Consequences

- **Good:** no junk `"Users"` rows from unverified requests; no pre-verification account link; a provisioning failure never blocks a login.
- **Trade-off:** an OTP user has an `auth.users` row but no `"Users"` row until they verify. Nothing reads `"Users"` for an unverified user, so no code path sees this gap.
- **Trade-off:** a swallowed failure leaves an authenticated user with no `"Users"` row. `getServerUser` already treats that as signed out. The warning in the Postgres logs is the only trace until an app-side capture lands.
- **Unchanged:** the trigger stays dumb; richer provisioning stays in `@troptix/api` services per ADR 0015.
