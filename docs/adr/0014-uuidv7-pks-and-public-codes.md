# 14. UUIDv7 primary keys + prefixed public codes

- **Status:** Accepted
- **Date:** 2026-06-09

## Context

Every model is declared `id String @id @default(uuid())` over a `TEXT` column, but the app **also** mints ids itself with `generateId()` (a `short-unique-id` 12-char `alphanum_upper` code) and passes them on create — while other creates fall back to the `@default(uuid())`. The result: the database holds a **mix of two id formats** (UUID v4 from the default, and 12-char short codes), and the primary key is doing double duty as both the internal join key _and_ a user-facing reference (order ids are printed on receipts as `#{order.id}`, used in URLs, etc.).

The short-code-as-PK has real downsides:

- **Keyspace + no retry** — `36¹² ≈ 4.7×10¹⁸`, far smaller than a UUID's 122 random bits, and `generateId()` is called once with no collision retry (a collision is a hard insert error).
- **Random** — no time-ordering, so poor index locality at scale (same as UUID v4).
- **Overloaded** — the PK is also the human-facing id, coupling "stable internal identity" with "nice to read," and the alphabet includes ambiguous chars (0/O, 1/I).

The reservation primitives need ids to be **known before insert** (they set reservation/order/ticket ids and wire relations inside one transaction), so DB-generated keys (`gen_random_uuid()` + `RETURNING`) are a poor fit — app-generated ids are the right pattern; only the _format_ is in question.

## Decision

Adopt a **two-id model** (the Stripe pattern):

| Column                    | Role                                                                  | Format                                                   |
| ------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| **`id`** (PK)             | internal identity, all FK joins — never shown to users                | **UUIDv7**, app-generated, native Postgres `uuid` column |
| **`publicCode`** (unique) | the id users _and_ devs reference — URLs, receipts, QR, support, logs | **`<PREFIX><BODY>`**                                     |

- **`id` = UUIDv7**: keeps the pre-known-id pattern; 128-bit keyspace (collisions a non-issue, no retry logic); **time-ordered**, so index locality is good. Native `uuid` type (16 bytes) rather than `TEXT`.
- **`publicCode`** format: a **short uppercase prefix, no separator**, followed by a **10-char Crockford base32** body (the Crockford alphabet omits the ambiguous `I L O U`). Unique-constrained per its prefix-namespace; the generator **retries on the rare unique violation**. Examples: `O7H3K9F2QA`, `T4B2NPQ8RW`, `ETKD9X3M2Q`.

  | Entity                    | Prefix |
  | ------------------------- | ------ |
  | Order                     | `O`    |
  | OrderTicket (ticket)      | `T`    |
  | Event                     | `E`    |
  | EventTicket (ticket type) | `ET`   |
  | Reservation               | `R`    |
  | User                      | `U`    |

  `publicCode` is added to the entities that are **externally referenced** (Order, OrderTicket, Event, Reservation to start) — not necessarily every table. FKs always reference `id`; external/human lookups go through `publicCode`.

- App generates **both** at insert. `generateId()` (in `@troptix/api/services/_shared/ids.ts` and `apps/web`) switches from short codes to **UUIDv7**; a new `generatePublicCode(prefix)` util produces the prefixed code. The dead `@default(uuid())` (v4) is reconciled — UUIDv7 from the app is authoritative.

## Consequences

- **Good:** collision-proof, time-ordered PK; clean separation of internal identity vs. user-facing reference; **self-describing** ids (you can tell an order from a ticket at a glance — great for support/debugging/logs); reconciles today's mixed-format mess into one scheme.
- **Cost (significant):** a **heavy migration** — converting the PK from `TEXT` to native `uuid` across **every table and all ~80+ FK columns**, rewriting the existing mixed-format rows (short-code PKs and their FKs must be re-keyed), plus adding unique `publicCode` columns with a backfill. It touches the app's id handling throughout. This is **not** a standalone change — it lands inside the schema-redesign migrations and is coordinated with the app cutover (Stage 2/3), so FKs/refs move in lockstep. A lighter fallback exists if scope must shrink: keep PKs as `TEXT` storing UUIDv7 strings (skips the column-type churn, loses the 16-byte storage win).
- **Sequencing:** captured here as the decision; executed as part of the schema redesign (Stage 1b / the cutover). Forward-looking code (the not-yet-live reservation services) should start minting UUIDv7 so no new short codes are created.
- **Relates to:** [ADR 0007](0007-reservation-based-checkout.md) (reservations rely on pre-known ids), the schema redesign in the [platform plan](../plans/2026-06-shared-packages-platform.md).
