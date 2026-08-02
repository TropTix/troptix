import { clsx, type ClassValue } from 'clsx';
import ShortUniqueId from 'short-unique-id';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getFormattedCurrency(price) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  return formatter.format(price);
}

/** The public event page's price line; shared with its form preview. */
export function priceLabelFor(fromPriceCents: number | null): string {
  if (fromPriceCents == null) return 'No tickets available';
  if (fromPriceCents === 0) return 'Free';
  return `From ${getFormattedCurrency(fromPriceCents / 100)} USD`;
}

/**
 * Human-readable order reference derived from the id (which stays the real key
 * in URLs). Matches the `TT-` short code shown elsewhere in the app.
 */
export function formatOrderNumber(id: string): string {
  return `TT-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

/** Up to two uppercase initials from a name, or '?' when there are none. */
export function initials(name: string): string {
  const result = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return result || '?';
}

export function generateId() {
  const uid = new ShortUniqueId({
    dictionary: 'alphanum_upper',
    length: 12,
  });

  return uid.rnd();
}
