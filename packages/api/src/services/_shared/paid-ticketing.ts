/**
 * The paid-ticketing gate: a PAID ticket type (price > 0) requires the owning
 * `Organization.paidTicketingEnabled`; RSVP (price = 0) is always allowed.
 *
 * One enforcement point shared by every ticket-bearing write path — event
 * create/update and the ticket-type writes (#452) — so the rule can't drift
 * between copies. Application-layer by design (CONTEXT.md), not a DB
 * constraint. The gate applies to writes only: if an org loses approval,
 * existing paid events are left alone.
 */
import { PaidTicketingNotEnabledError } from './errors';

export function assertPaidTicketingAllowed(
  org: { paidTicketingEnabled: boolean },
  ticketTypes: readonly { priceCents: number }[]
): void {
  if (org.paidTicketingEnabled) return;
  if (ticketTypes.some((ticketType) => ticketType.priceCents > 0)) {
    throw new PaidTicketingNotEnabledError();
  }
}
