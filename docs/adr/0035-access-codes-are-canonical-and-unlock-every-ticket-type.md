# 35. Access codes are stored canonical, matched exactly, and unlock every ticket type that carries them

- **Status:** Accepted
- **Date:** 2026-10-13

## Context

An organizer can put an access code on a ticket type. A ticket type with a
code is hidden from the public event page until a buyer enters it. The column
was named `discountCode`, but nothing ever changed a price: every layer
treated it as a password.

The lookup compared the submitted code case-insensitively with `ILIKE`, which
Prisma does not escape, so the service hand-escaped `%` and `_`. It used
`findFirst`, so an organizer who put the same code on two ticket types only
ever unlocked one. And the reservation service rejected every gated ticket
type outright, so even an unlocked one could not be bought.

## Decision

- The column is `accessCode`. It is an unlock, never a discount.
- A code is stored trimmed and uppercased. The organizer write path and the
  buyer submit path both normalize the same way, and the rename migration
  canonicalizes existing rows. The lookup is plain equality on `accessCode`.
  An empty code is stored as `NULL`, so "public ticket type" means
  `accessCode IS NULL`.
- One code unlocks every ticket type on the event that carries it. Apply-code
  returns the full list in the same shape the event page uses.
- The reservation input carries the buyer's code. The service loads public
  ticket types plus every one whose code matches, so the server stays the
  authority over what a buyer can hold. There is no unlock token or session
  state.
- Apply-code is a mutation, so the code travels in the request body rather
  than a query string that lands in edge logs.

## Consequences

- No escaping code, no `ILIKE`, and the existing `eventId` index covers the
  lookup since an event has a handful of ticket types.
- Organizers see their code uppercased after save. That is the string buyers
  must type, modulo case, which the buyer path also uppercases.
- The migration uppercases with Postgres, later writes with JavaScript. For
  letters outside ASCII the two can disagree (`ß`, for one), so a legacy
  non-ASCII code may need re-saving by its organizer. New codes never hit this
  since every write goes through the same JavaScript path.
- A buyer holds one code per checkout. Two hidden ticket types meant for the
  same group should share one code; a buyer with two different codes for one
  event cannot combine them in one order.
- There is no rate limit on apply-code. Guessing a code reveals a ticket type
  and lets the guesser pay full price for it, which is the same outcome as the
  organizer sharing the code. If abuse shows up, a limiter is its own change.
