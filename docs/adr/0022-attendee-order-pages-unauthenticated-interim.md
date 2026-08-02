# 22. Attendee order and ticket pages are unauthenticated in the interim

- **Status:** Accepted
- **Date:** 2026-07-27

## Context

The attendee-facing `/orders/[orderId]` (Order page) and `/orders/[orderId]/tickets`
(User Ticket page) have never had an auth guard. Access "works" only because `orderId`
is an unguessable UUID doing the job of a bearer token — and that same id is printed on
receipts and used in support, so it is not a secret. The planned fix — an `accessToken`
plus an `accessMode` owner/guest resolver ([orders-tickets-redesign](../plans/2026-07-orders-tickets-redesign.md)
Phase 1) — is deferred. A cleanup pass consolidated these pages but deliberately shipped
no new capability, so the guard did not land.

## Decision

Leave these pages open for now and **minimize the PII they expose** rather than gate them:
drop the billing address from the Order page, keep only card last-4. Keep the unused
`Orders.accessToken` column as the documented placeholder so the guard can be built later
without a second migration. Do not add new PII to these surfaces until the guard exists.

## Consequences

Anyone with an order URL can still see the buyer's name, the ticket QR codes, and card
last-4 — accepted as interim risk, reduced (not closed) by removing billing. Link-forwarding
stays an implicit, ungated way to share tickets. The real fix remains the deferred `accessMode`
guard; this ADR is superseded once it ships.
