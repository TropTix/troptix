# 15. Passwordless auth and trigger-based user provisioning

- **Status:** Accepted
- **Date:** 2026-06-10
- **Amends:** [ADR 0011](0011-supabase-auth-identity.md) — supersedes its password-preserving scrypt import; the rest of 0011 (decoupled `authUserId` identity, orphan-safe sequencing, RLS strategy) stands.

## Context

[ADR 0011](0011-supabase-auth-identity.md) planned the Firebase → Supabase Auth move with a **password-preserving import**: replay each user's Firebase `scrypt` hash into Supabase via GoTrue's `firebase_scrypt` support. On revisiting this, two things changed the calculus:

1. **The password import is the riskiest, least-reversible step.** Verified against the GoTrue source (`internal/crypto/password.go`): Supabase _can_ verify Firebase scrypt at login via a `$fbscrypt$v=1,n=…,r=…,p=…,ss=…,sk=…$<salt>$<hash>` format, but the off-the-shelf `supabase-community/firebase-to-supabase` `import_users.js` **discards passwords** (`encrypted_password = ''`) and mints a new random uuid — so the "official tool" path silently locks everyone out. Doing it correctly means hand-building the `$fbscrypt$` string with the right project params; wrong params fail logins _silently_. The Admin API `password_hash` path has a documented bug ([supabase/auth#1678](https://github.com/supabase/auth/issues/1678)).

2. **Almost nobody uses passwords.** Of the 35 users who logged in over the last year, only 12 used a password; most users don't log in at all. Carrying a fragile, silent-failure-prone import for 12 logins is a bad trade.

We also evaluated Supabase **Firebase Third-Party Auth** (keep Firebase as the IdP, validate its JWT in Supabase for RLS). Rejected: it entrenches Firebase permanently, and leaving Firebase entirely — dropping `firebase-admin`, killing the JWT-cookie auth flicker, consolidating to one vendor — is itself a first-class goal.

Separately, provisioning the `public."Users"` row for a new signup raised a trigger-vs-application-code question, because passwordless + OAuth flows create the `auth.users` row **out of band** (inside Supabase's hosted GoTrue flow), where our backend does not run.

## Decision

**1. Drop password migration entirely; go passwordless.** Existing Firebase passwords are not carried over. Auth methods become **email OTP / magic-link + Google/Apple OAuth**. Existing accounts are claimed on first login by verified email — Supabase [auto-links](https://supabase.com/docs/guides/auth/auth-identity-linking) an OAuth identity to an existing account when the email matches and is confirmed, so we pre-create `auth.users` rows with `email_confirmed_at` set. A user who wants a password can set one later via account settings (`auth.updateUser`); we never _migrate_ one. This also makes a future "force login" easier — no password friction in the way, users just tap a link or use Google.

**2. Provision `public."Users"` with a database trigger, not application code.** An `AFTER INSERT ON auth.users` trigger (`handle_new_auth_user`) runs in the same transaction as the auth insert — the only option with **no orphan window, no first-request race, and no bypass** by any current or future client, given that OAuth/magic-link create the user out of band. It is **link-or-create**: link an existing app user by email (which doubles as the migration backfill — inserting `auth.users` rows auto-links existing customers, so no separate backfill script), else create a fresh row. The trigger stays deliberately **minimal** — a referential-existence guarantee, not business logic. All richer logic (Stripe customer, welcome email, enrichment) stays in `@troptix/api` services on the first authenticated request, per [ADR 0013](0013-authorization-in-the-service-layer.md).

**3. Keep 0011's decoupled identity, uniformly.** `Users.id` stays the app PK; `authUserId uuid → auth.users(id)` is the link; they are never equal — including for **new** users (the trigger generates a fresh `Users.id`, never the auth uid), so no code is ever tempted to assume equality.

## Consequences

- **Good:** the entire scrypt-import risk surface (silent login failures, `$fbscrypt$` fidelity, the Admin-API bug, the password-wiping stock tool) disappears. Lower-friction login for an app people use rarely. No orphaned auth users. A future forced-login is cheap. Firebase exit stays on track.
- **Trade-off:** email deliverability becomes a **hard dependency for all logins**, not just resets — the transactional email path (SPF/DKIM/DMARC, sending domain) must be solid before cutover. The trigger is out-of-band SQL rather than visible TS — mitigated by keeping it dumb, heavily commented, and pointing back here. Until a Custom Access Token hook stamps `troptix_user_id`/role into the JWT, the tRPC context resolves the actor with one indexed `authUserId` lookup per request (acceptable; the hook is a deferred optimization).
- **Risk:** a trigger that throws **blocks signups** → keep it minimal and test on a preview branch. Creating triggers on `auth.users` can be restricted on some Supabase tiers → verify on a preview branch. Email case/sync: matched case-insensitively; `auth.users.email` is the source of truth and an email-change sync to `Users.email` is deferred until users actually change emails.
- **Multi-provider linking:** when a user later signs in with a second provider (Google then Apple), Supabase auto-links it to the existing account by matching **verified** email — no new `auth.users` row, so the trigger correctly does not fire. The exception is a provider returning a _different_ email, notably **Apple "Hide My Email"** (a `@privaterelay.appleid.com` relay) or genuinely distinct provider emails: Supabase then creates a separate `auth.users` row and the trigger creates a separate `Users` row (a duplicate person). The trigger must **not** silently merge — guessing identity is an account-takeover risk. Mitigations: lead with email OTP as the primary method (the stable join key); offer manual `auth.linkIdentity()` for logged-in users; provide a lightweight merge/support path. Low-stakes at current login volume.
