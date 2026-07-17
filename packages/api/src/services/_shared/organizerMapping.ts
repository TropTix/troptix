/**
 * Shaping helpers shared by the organizer reads: the float→cents boundary and
 * the day-key / customer-display formatters.
 */

/**
 * Float dollars → integer cents. Round **once**, on an already-summed total —
 * never per row — so float error can't accumulate.
 */
export function toCents(dollars: number | null | undefined): number {
  return Math.round((dollars ?? 0) * 100);
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
