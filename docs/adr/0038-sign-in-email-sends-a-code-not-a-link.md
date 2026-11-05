# 38. The sign-in email sends a code, not a link

- **Status:** Accepted
- **Date:** 2026-11-04

## Context

The sign-in email carried both a one-click link (`{{ .ConfirmationURL }}`) and a 6-digit code. Bots typed real people's work addresses into the sign-in form. Company mail scanners (Microsoft Defender, Mimecast and the like) open every link in incoming mail. Opening ours confirmed the address in Supabase. The scanner then stopped at `/auth/callback`, since it lacked the PKCE cookie needed to finish signing in.

Since [ADR 0036](0036-provision-users-at-email-confirmation.md), confirmation is what provisions a `"Users"` row. So a scanner still created one for a request nobody finished. On 2026-11-04 production held 23 such accounts: company addresses, confirmed, never signed in.

## Decision

The sign-in email carries only the code. The template no longer uses `{{ .ConfirmationURL }}`, and the web form asks for "a sign-in code". The mobile app already used the code alone.

The same template serves the "Confirm signup" and "Magic Link" emails. `supabase/config.toml` points both at it for local and preview projects. Production's copies live in the dashboard and must be pasted by hand.

## Consequences

- Only someone who reads the email and types the code can confirm an address. A scanner has nothing to open.
- Signing in takes six digits instead of one tap, and a person who opens the email on another device can still sign in.
- Turnstile still blocks most bot requests; this closes the gap for those that get through.
- A one-tap link could return later through a page with a "Sign in" button that verifies the `token_hash` on press. We chose not to build that page now.
