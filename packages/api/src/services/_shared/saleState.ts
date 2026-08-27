import type { SaleState } from '../../contracts/organizer';

export function getSaleState(
  tier: { saleStartsAt: Date; saleEndsAt: Date },
  now: Date = new Date()
): SaleState {
  if (now < tier.saleStartsAt) return 'Scheduled';
  if (now > tier.saleEndsAt) return 'Ended';
  return 'OnSale';
}
