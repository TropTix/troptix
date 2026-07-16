/**
 * Shaping helpers shared by the organizer reads: the float→cents boundary and
 * the reservation-era-column fallbacks. One home so the fallback rules can't
 * drift between screens while the legacy columns are still around.
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

/** Reservation-era `priceCents`, falling back to legacy `price` dollars. */
export function priceCentsOf(tier: {
  priceCents: number | null;
  price: number;
}): number {
  return tier.priceCents ?? toCents(tier.price);
}

/** Atomic `startsAt`, falling back to the legacy split `startDate`. */
export function startsAtOf(event: {
  startsAt: Date | null;
  startDate: Date;
}): Date {
  return event.startsAt ?? event.startDate;
}

/** Atomic `endsAt`, falling back to the legacy split `endDate`. */
export function endsAtOf(event: { endsAt: Date | null; endDate: Date }): Date {
  return event.endsAt ?? event.endDate;
}

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
