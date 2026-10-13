import type { EventTicket } from '../../contracts/events';
import { calculateFeesCents } from './fees';
import { getSaleState } from './saleState';

const SALE_STATUS = {
  Scheduled: 'notYetOnSale',
  OnSale: 'onSale',
  Ended: 'saleEnded',
} as const;

export interface EventTicketRow {
  id: string;
  name: string;
  description: string;
  priceCents: number | null;
  price: number;
  ticketingFees: 'ABSORB_TICKET_FEES' | 'PASS_TICKET_FEES';
  capacity: number;
  reserved: number;
  sold: number;
  maxPurchasePerUser: number;
  saleStartsAt: Date | string;
  saleEndsAt: Date | string;
}

export function toEventTicket(
  tt: EventTicketRow,
  isDraft: boolean,
  now: Date
): EventTicket {
  const priceCents = tt.priceCents ?? Math.round(tt.price * 100);
  const availability = Math.max(0, tt.capacity - tt.reserved - tt.sold);
  const saleWindow = {
    saleStartsAt: new Date(tt.saleStartsAt),
    saleEndsAt: new Date(tt.saleEndsAt),
  };
  const saleStatus: EventTicket['saleStatus'] =
    availability === 0 ? 'soldOut' : SALE_STATUS[getSaleState(saleWindow, now)];
  const maxAllowedToAdd =
    saleStatus === 'onSale' && !isDraft
      ? Math.max(0, Math.min(availability, tt.maxPurchasePerUser))
      : 0;
  const feesCents =
    tt.ticketingFees === 'PASS_TICKET_FEES'
      ? calculateFeesCents(priceCents)
      : 0;

  return {
    id: tt.id,
    name: tt.name,
    description: tt.description,
    priceCents,
    feesCents,
    maxAllowedToAdd,
    saleStatus,
  };
}

export function sortEventTickets(tickets: EventTicket[]): EventTicket[] {
  return [...tickets].sort((a, b) => {
    const aOut = a.maxAllowedToAdd > 0 ? 0 : 1;
    const bOut = b.maxAllowedToAdd > 0 ? 0 : 1;
    return aOut !== bOut ? aOut - bOut : a.priceCents - b.priceCents;
  });
}
