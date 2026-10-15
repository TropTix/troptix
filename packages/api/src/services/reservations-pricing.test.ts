import { describe, expect, it } from 'vitest';
import { deriveReserveItems, type PricedTicketTypeRow } from './reservations';
import { NotFoundError } from './_shared/errors';

const NOW = new Date('2026-06-15T12:00:00Z');

function ticketType(
  overrides: Partial<PricedTicketTypeRow> = {}
): PricedTicketTypeRow {
  return {
    id: 'tt-1',
    priceCents: 2500,
    price: 25,
    ticketingFees: 'PASS_TICKET_FEES',
    maxPurchasePerUser: 10,
    saleStartsAt: new Date(NOW.getTime() - 86_400_000),
    saleEndsAt: new Date(NOW.getTime() + 86_400_000),
    isDraft: false,
    ...overrides,
  };
}

describe('deriveReserveItems', () => {
  it('derives unit price + passed fees (8% + $0.50) from the ticket type, ignoring the client', () => {
    const [item] = deriveReserveItems(
      [ticketType({ id: 'a', priceCents: 5000 })],
      [{ ticketTypeId: 'a', quantity: 2 }],
      NOW
    );
    expect(item.unitPriceCents).toBe(5000);
    expect(item.feesCents).toBe(450);
    expect(item.quantity).toBe(2);
  });

  it('charges no fee for a free ticket type (keeps it genuinely free)', () => {
    const [item] = deriveReserveItems(
      [ticketType({ id: 'a', priceCents: 0, price: 0 })],
      [{ ticketTypeId: 'a', quantity: 1 }],
      NOW
    );
    expect(item.unitPriceCents).toBe(0);
    expect(item.feesCents).toBe(0);
  });

  it('charges no fee when the organizer absorbs fees', () => {
    const [item] = deriveReserveItems(
      [
        ticketType({
          id: 'a',
          priceCents: 5000,
          ticketingFees: 'ABSORB_TICKET_FEES',
        }),
      ],
      [{ ticketTypeId: 'a', quantity: 1 }],
      NOW
    );
    expect(item.feesCents).toBe(0);
  });

  it('falls back to legacy price*100 when priceCents is null (pre-backfill)', () => {
    const [item] = deriveReserveItems(
      [ticketType({ id: 'a', priceCents: null, price: 25 })],
      [{ ticketTypeId: 'a', quantity: 1 }],
      NOW
    );
    expect(item.unitPriceCents).toBe(2500);
  });

  it('clamps quantity to maxPurchasePerUser', () => {
    const [item] = deriveReserveItems(
      [ticketType({ id: 'a', maxPurchasePerUser: 4 })],
      [{ ticketTypeId: 'a', quantity: 9 }],
      NOW
    );
    expect(item.quantity).toBe(4);
  });

  it('throws NotFoundError for a ticket type not in the returned rows (missing/gated/wrong event)', () => {
    expect(() =>
      deriveReserveItems(
        [ticketType({ id: 'a' })],
        [{ ticketTypeId: 'gated', quantity: 1 }],
        NOW
      )
    ).toThrow(NotFoundError);
  });

  describe('sale-window + draft gate', () => {
    it('throws NotFoundError before the sale window opens', () => {
      expect(() =>
        deriveReserveItems(
          [
            ticketType({
              id: 'a',
              saleStartsAt: new Date(NOW.getTime() + 1000),
              saleEndsAt: new Date(NOW.getTime() + 86_400_000),
            }),
          ],
          [{ ticketTypeId: 'a', quantity: 1 }],
          NOW
        )
      ).toThrow(NotFoundError);
    });

    it('throws NotFoundError after the sale window closes', () => {
      expect(() =>
        deriveReserveItems(
          [
            ticketType({
              id: 'a',
              saleStartsAt: new Date(NOW.getTime() - 86_400_000),
              saleEndsAt: new Date(NOW.getTime() - 1000),
            }),
          ],
          [{ ticketTypeId: 'a', quantity: 1 }],
          NOW
        )
      ).toThrow(NotFoundError);
    });

    it('throws NotFoundError for a draft event even when on sale', () => {
      expect(() =>
        deriveReserveItems(
          [ticketType({ id: 'a', isDraft: true })],
          [{ ticketTypeId: 'a', quantity: 1 }],
          NOW
        )
      ).toThrow(NotFoundError);
    });

    it('allows an on-sale, non-draft ticket type through', () => {
      const [item] = deriveReserveItems(
        [ticketType({ id: 'a', isDraft: false })],
        [{ ticketTypeId: 'a', quantity: 1 }],
        NOW
      );
      expect(item.quantity).toBe(1);
    });
  });

  describe('duplicate-ticket-type aggregation + deterministic ordering', () => {
    it('sums duplicate ticketTypeId entries before clamping to maxPurchasePerUser (no cap bypass)', () => {
      const items = deriveReserveItems(
        [ticketType({ id: 'a', maxPurchasePerUser: 4 })],
        [
          { ticketTypeId: 'a', quantity: 3 },
          { ticketTypeId: 'a', quantity: 3 },
        ],
        NOW
      );
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(4);
    });

    it('sorts output ascending by ticketTypeId regardless of input order', () => {
      const items = deriveReserveItems(
        [
          ticketType({ id: 'z' }),
          ticketType({ id: 'a' }),
          ticketType({ id: 'm' }),
        ],
        [
          { ticketTypeId: 'z', quantity: 1 },
          { ticketTypeId: 'a', quantity: 1 },
          { ticketTypeId: 'm', quantity: 1 },
        ],
        NOW
      );
      expect(items.map((i) => i.ticketTypeId)).toEqual(['a', 'm', 'z']);
    });
  });
});
