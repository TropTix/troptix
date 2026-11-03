# 36. Provision app users at email confirmation, and fail the sign-in loudly

- **Status:** Accepted
- **Date:** 2026-11-03
- **Amends:** [ADR 0015](0015-passwordless-auth-and-trigger-provisioning.md) — its trigger fired `after insert on auth.users`; it now fires on email confirmation. The rest of 0015 (trigger over app code, link-or-create by email, decoupled `authUserId`) stands.

## Context

ADR 0015 provisioned `public."Users"` from an `after insert on auth.users` trigger. Supabase's `signInWithOtp` inserts the `auth.users` row when the email is _requested_, before anyone proves they own the address. Two problems followed:

1. Every unverified or bot request created a `"Users"` row. By 2026-11-03, 346 of 403 auth users had never confirmed (#405).
2. The link step set `authUserId` on an existing `"Users"` row whose email matched. A stranger could request a code for someone else's email and claim that account's row before verifying anything.

#323 asked for the trigger to swallow its own errors, so a failure could never block a login. But a swallowed failure still leaves the person stuck: Supabase issues a session, the app finds no `"Users"` row and treats them as signed out, and nothing ever runs the trigger again.

## Decision

1. **The trigger fires on confirmation.** It runs `after insert or update of email_confirmed_at on auth.users` with `when (new.email_confirmed_at is not null)`. OAuth sign-ups arrive confirmed and provision at insert. Email users provision when they verify. A request that is never verified creates no `"Users"` row and links nothing.
2. **The function is idempotent.** It returns early when a `"Users"` row already carries this `authUserId`.
3. **An error fails the sign-in.** The trigger raises, Supabase rolls back the confirmation and returns a 5xx, and the person sees "We couldn't finish signing you in. Please try again." A retry runs the trigger again. The web app reports each 5xx as `auth_sign_in_failed` in PostHog, from the code form and from `/auth/callback`.
4. **The app reports a session with no `"Users"` row** as `auth_user_unprovisioned`, whatever the cause.

## Consequences

- `"Users"` holds only people who proved they own an address, and no unverified request can claim an existing row.
- A transient failure fixes itself on retry. A lasting one (an email already linked to another identity) blocks that person's sign-in with an error until someone fixes the row; `auth_sign_in_failed` says it happened, and the Supabase auth logs say why.
- A bug in the trigger blocks every new sign-in, visibly, instead of silently leaving people signed out.
- The trigger stays dumb; richer provisioning stays in `@troptix/api` services per ADR 0015.
