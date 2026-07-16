/**
 * Shaping helpers shared by the organizer reads: the float→cents boundary and
 * the reservation-era-column fallbacks.
 *
 * These are the organizer surface's home for the rules. The same fallbacks are
 * still inlined in `services/events.ts`, `services/checkout.ts`,
 * `services/reservations.ts` and `_shared/eventSummary.ts` — pointing those at
 * these helpers is worth a follow-up, so that dropping a fallback after the
 * backfill is one edit rather than five.
 */

/**
 * Float dollars → integer cents. Round **once**, on an already-summed total —
 * never per row — so float error can't accumulate.
 */
export function toCents(dollars: number | null | undefined): number {
  return Math.round((dollars ?? 0) * 100);
}

/** Reservation-era `capacity`, falling back to legacy `quantity`. */
export function capacityOf(tier: {
  capacity: number | null;
  quantity: number;
}): number {
  return tier.capacity ?? tier.quantity;
}

// No `startsAtOf`/`endsAtOf`: `Events.startsAt`/`endsAt` were backfilled once and
// are maintained by nothing (createEvent leaves them null, updateEvent leaves
// them stale), so reads use `startDate`/`endDate` directly — the legacy columns
// are the reliable ones until roadmap 2.10 wires the writes.

/** yyyy-mm-dd, for the day-bucketed series the charts render. */
export function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Name → email → 'N/A', for order/attendee display. */
export function customerDisplay(order: {
  name: string | null;
  email: string | null;
}): string {
  return order.name?.trim() || order.email?.trim() || 'N/A';
}
