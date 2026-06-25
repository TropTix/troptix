/**
 * Unit tests for the pure server-side pricing authority (`deriveReserveItems`).
 * No Postgres — it's pure over the tier rows + selection (ADR 0010).
 */
import { describe, expect, it } from 'vitest';
import { deriveReserveItems, type PricedTierRow } from './reservations';
import { NotFoundError } from './_shared/errors';

function tier(overrides: Partial<PricedTierRow> = {}): PricedTierRow {
  return {
    id: 'tt-1',
    priceCents: 2500,
    price: 25,
    ticketingFees: 'PASS_TICKET_FEES',
    maxPurchasePerUser: 10,
    ...overrides,
  };
}

describe('deriveReserveItems', () => {
  it('derives unit price + passed fees (8% + $0.50) from the tier, ignoring the client', () => {
    const [item] = deriveReserveItems(
      [tier({ id: 'a', priceCents: 5000 })],
      [{ ticketTypeId: 'a', quantity: 2 }]
    );
    expect(item.unitPriceCents).toBe(5000);
    expect(item.feesCents).toBe(450); // round(5000*0.08 + 50)
    expect(item.quantity).toBe(2);
  });

  it('charges no fee for a free tier (keeps it genuinely free)', () => {
    const [item] = deriveReserveItems(
      [tier({ id: 'a', priceCents: 0, price: 0 })],
      [{ ticketTypeId: 'a', quantity: 1 }]
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
      [{ ticketTypeId: 'a', quantity: 1 }]
    );
    expect(item.feesCents).toBe(0);
  });

  it('falls back to legacy price*100 when priceCents is null (pre-backfill)', () => {
    const [item] = deriveReserveItems(
      [tier({ id: 'a', priceCents: null, price: 25 })],
      [{ ticketTypeId: 'a', quantity: 1 }]
    );
    expect(item.unitPriceCents).toBe(2500);
  });

  it('clamps quantity to maxPurchasePerUser', () => {
    const [item] = deriveReserveItems(
      [tier({ id: 'a', maxPurchasePerUser: 4 })],
      [{ ticketTypeId: 'a', quantity: 9 }]
    );
    expect(item.quantity).toBe(4);
  });

  it('throws NotFoundError for a tier not in the returned rows (missing/gated/wrong event)', () => {
    expect(() =>
      deriveReserveItems(
        [tier({ id: 'a' })],
        [{ ticketTypeId: 'gated', quantity: 1 }]
      )
    ).toThrow(NotFoundError);
  });
});
