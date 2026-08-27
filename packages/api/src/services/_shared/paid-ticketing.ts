/**
 * Application-layer by design — never a DB constraint. Writes only: an org
 * that loses approval keeps its existing paid events.
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
