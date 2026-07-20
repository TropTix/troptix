/**
 * Unit tests for the pure server-side pricing authority (`deriveReserveItems`).
 * No Postgres — it's pure over the tier rows + selection (ADR 0010).
 */
import { describe, expect, it } from 'vitest';
import { deriveReserveItems, type PricedTierRow } from './reservations';
import { NotFoundError } from './_shared/errors';

const NOW = new Date('2026-06-15T12:00:00Z');

function tier(overrides: Partial<PricedTierRow> = {}): PricedTierRow {
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
  it('derives unit price + passed fees (8% + $0.50) from the tier, ignoring the client', () => {
    const [item] = deriveReserveItems(
      [tier({ id: 'a', priceCents: 5000 })],
      [{ ticketTypeId: 'a', quantity: 2 }],
      NOW
    );
    expect(item.unitPriceCents).toBe(5000);
    expect(item.feesCents).toBe(450); // round(5000*0.08 + 50)
    expect(item.quantity).toBe(2);
  });

  it('charges no fee for a free tier (keeps it genuinely free)', () => {
    const [item] = deriveReserveItems(
      [tier({ id: 'a', priceCents: 0, price: 0 })],
      [{ ticketTypeId: 'a', quantity: 1 }],
      NOW
    );
    expect(item.unitPriceCents).toBe(0);
    expect(item.feesCents).toBe(0);
  });

  it('charges no fee when the organizer absorbs fees', () => {
    const [item] = deriveReserveItems(
      [
        tier({
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
      [tier({ id: 'a', priceCents: null, price: 25 })],
      [{ ticketTypeId: 'a', quantity: 1 }],
      NOW
    );
    expect(item.unitPriceCents).toBe(2500);
  });

  it('clamps quantity to maxPurchasePerUser', () => {
    const [item] = deriveReserveItems(
      [tier({ id: 'a', maxPurchasePerUser: 4 })],
      [{ ticketTypeId: 'a', quantity: 9 }],
      NOW
    );
    expect(item.quantity).toBe(4);
  });

  it('throws NotFoundError for a tier not in the returned rows (missing/gated/wrong event)', () => {
    expect(() =>
      deriveReserveItems(
        [tier({ id: 'a' })],
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
            tier({
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
            tier({
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
          [tier({ id: 'a', isDraft: true })],
          [{ ticketTypeId: 'a', quantity: 1 }],
          NOW
        )
      ).toThrow(NotFoundError);
    });

    it('allows an on-sale, non-draft tier through', () => {
      const [item] = deriveReserveItems(
        [tier({ id: 'a', isDraft: false })],
        [{ ticketTypeId: 'a', quantity: 1 }],
        NOW
      );
      expect(item.quantity).toBe(1);
    });
  });

  describe('duplicate-tier aggregation + deterministic ordering', () => {
    it('sums duplicate ticketTypeId entries before clamping to maxPurchasePerUser (no cap bypass)', () => {
      const items = deriveReserveItems(
        [tier({ id: 'a', maxPurchasePerUser: 4 })],
        [
          { ticketTypeId: 'a', quantity: 3 },
          { ticketTypeId: 'a', quantity: 3 },
        ],
        NOW
      );
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(4); // clamped to the cap, not 6
    });

    it('sorts output ascending by ticketTypeId regardless of input order', () => {
      const items = deriveReserveItems(
        [tier({ id: 'z' }), tier({ id: 'a' }), tier({ id: 'm' })],
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
