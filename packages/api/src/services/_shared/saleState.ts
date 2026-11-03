import type { SaleState } from '../../contracts/organizer';

export function getSaleState(
  ticketType: { saleStartsAt: Date; saleEndsAt: Date },
  now: Date = new Date()
): SaleState {
  if (now < ticketType.saleStartsAt) return 'Scheduled';
  if (now > ticketType.saleEndsAt) return 'Ended';
  return 'OnSale';
}
