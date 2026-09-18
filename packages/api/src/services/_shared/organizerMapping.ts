/**
 * Float dollars → integer cents. Round once, on an already-summed total —
 * never per row — so float error can't accumulate.
 */
export function toCents(dollars: number | null | undefined): number {
  return Math.round((dollars ?? 0) * 100);
}

export function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * A "day" is UTC everywhere in the organizer reads; bounds, `date_trunc`, and
 * zero-fill join by bucket-instant, so a server-local boundary misaligns them.
 */
export function startOfUtcDay(instant: Date): Date {
  return new Date(
    Date.UTC(
      instant.getUTCFullYear(),
      instant.getUTCMonth(),
      instant.getUTCDate()
    )
  );
}

export function addUtcDays(instant: Date, days: number): Date {
  const next = new Date(instant);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function customerDisplay(order: {
  name: string | null;
  email: string | null;
}): string {
  return order.name?.trim() || order.email?.trim() || 'N/A';
}
