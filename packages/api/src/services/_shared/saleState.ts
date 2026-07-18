/**
 * One derivation of a ticket tier's sale-window state, so every organizer read
 * agrees on what "on sale" means. `now` is injectable for tests.
 *
 * `saleStartsAt`/`saleEndsAt` are full timestamps — the ticket form folds the
 * time input into them before submitting (ADR 0020).
 */
import type { SaleState } from '../../contracts/organizer';

/**
 * - `Scheduled` — the window hasn't opened yet.
 * - `OnSale`    — open now (start ≤ now ≤ end).
 * - `Ended`     — the window has closed.
 */
export function getSaleState(
  tier: { saleStartsAt: Date; saleEndsAt: Date },
  now: Date = new Date()
): SaleState {
  if (now < tier.saleStartsAt) return 'Scheduled';
  if (now > tier.saleEndsAt) return 'Ended';
  return 'OnSale';
}
