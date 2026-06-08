# 11. Supabase Auth migration and the user-identity strategy

- **Status:** Proposed
- **Date:** 2026-06-07

## Context

`User.id` currently *is* the Firebase UID: `api/user/create/route.ts` does `users.create({ data: { id } })` with the client-supplied Firebase UID, and that value is propagated as the FK across `Orders.userId`, `Tickets.userId`, `Reservation.userId`, `SocialMediaAccounts.userId`. Auth verification (`server/authUser.ts`, `server/lib/auth.ts`) calls `firebase-admin verifyIdToken`; the Expo organizer app sends a Firebase Bearer token. RLS is enabled on all tables (#283) but inert, because the app connects as a privileged role and the DB session has no `auth.uid()`.

The roadmap plans Firebase → Supabase Auth (P4.2) to remove the JWT-cookie bridge (the auth flicker), drop the extra organizer-check call, and integrate natively with Postgres/RLS. Building the shared API layer needs an auth context, so the provider choice can't be deferred — building the context on Firebase and rewriting it for Supabase wires every client twice. Supabase `auth.users` ids are UUIDs; Firebase UIDs are 28-char strings, so the existing PK values **cannot** be reused as Supabase ids. **Existing accounts (and Orders/Tickets — financial/attendance records) must be preserved.**

## Decision

Migrate to **Supabase Auth**, folded into the schema-foundation stage. Preserve identity by **keeping `User.id` stable** and adding `authUserId uuid @unique REFERENCES auth.users(id)`. The FK graph is never rewritten; RLS keys off `auth.uid() = authUserId` (joining through the stable `userId` for order/reservation tables, through `Event.organizerUserId` for organizer-scoped tables).

Sequenced orphan-safe: add column → import Firebase users into `auth.users` (password-preserving via GoTrue `firebase_scrypt`, stamping `app_metadata.troptix_user_id = User.id`) → backfill `authUserId` → **orphan gate** (`authUserId IS NULL` count = 0) → author RLS policies (kept non-load-bearing; app stays on the bypassrls connection this stage) → cut over verification (return `userId` = `troptix_user_id` from the JWT, so the ~24 callsites are unchanged) → cut over issuance. A **dual-verify shim** (Supabase, falling back to Firebase) covers the Expo cross-repo lag until the organizer app ships Supabase tokens, then is removed with the `firebase`/`firebase-admin` deps.

Invariant going forward: `authUserId` is always the auth key, `id` is always the app PK — never assume equality (existing users have `id ≠ authUserId`).

## Consequences

- **Good:** accounts preserved with zero FK rewrite; RLS (already enabled) becomes meaningful; the auth context + client token wiring are built once against Supabase; the JWT-cookie flicker goes away.
- **Trade-off:** RLS policies route through a join to `authUserId` rather than a direct `auth.uid() = id`; a transient dual-verify shim; a careful one-time password import.
- **Risk:** wrong scrypt params fail logins silently (mitigate: import a handful first, verify on a preview branch); returning `authUserId` instead of the stable `User.id` from the verify path would break every organizer query (mitigate: stamp `troptix_user_id` in the JWT, assert the return shape in a test). Going *live* on RLS (flipping the runtime connection to `authenticated`) is deferred until policies are proven.
