import { clsx, type ClassValue } from 'clsx';
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

const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * CSPRNG id — 12 chars over a 36-symbol uppercase-alphanumeric alphabet (same
 * format as before). Web Crypto is available in Node 18+, the browser, the edge
 * runtime, and the jsdom test env. Rejection sampling keeps the distribution
 * uniform (256 % 36 != 0, so a naive modulo would bias toward earlier symbols).
 * The reservation id is the checkout's authorization token — it must not be
 * predictable from prior ids. Mirrors `@troptix/api`'s `generateId`.
 */
export function generateId(): string {
  const len = 12;
  const max = 256 - (256 % ID_ALPHABET.length); // reject bytes >= 252 (avoid modulo bias)
  const out: string[] = [];
  while (out.length < len) {
    const bytes = new Uint8Array(len - out.length);
    globalThis.crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b < max) out.push(ID_ALPHABET[b % ID_ALPHABET.length]);
    }
  }
  return out.join('');
}
