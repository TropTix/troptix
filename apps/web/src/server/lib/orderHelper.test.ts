// Mock @troptix/db to avoid Prisma/pg requiring a live database in tests
jest.mock('@troptix/db', () => ({
  OrderStatus: { COMPLETED: 'COMPLETED', PENDING: 'PENDING' },
  TicketStatus: { AVAILABLE: 'AVAILABLE', NOT_AVAILABLE: 'NOT_AVAILABLE' },
  TicketType: { FREE: 'FREE', PAID: 'PAID', COMPLEMENTARY: 'COMPLEMENTARY' },
}));

// mock micro (unused in the functions under test but imported at module level)
jest.mock('micro', () => ({ buffer: jest.fn() }));

import {
  updateSuccessfulOrder,
  updateTicketTypeQuantitySold,
} from './orderHelper';

describe('updateSuccessfulOrder', () => {
  it('returns COMPLETED status with null card fields when paymentMethod is null', () => {
    const result = updateSuccessfulOrder(null);
    expect(result.status).toBe('COMPLETED');
    expect(result.cardType).toBeNull();
    expect(result.cardLast4).toBeNull();
  });

  it('returns card brand and last4 from a card payment method', () => {
    const result = updateSuccessfulOrder({
      card: { brand: 'visa', last4: '4242' },
    } as any);
    expect(result.cardType).toBe('visa');
    expect(result.cardLast4).toBe('4242');
  });

  it('returns null card fields without throwing for a non-card payment method', () => {
    const result = updateSuccessfulOrder({ type: 'us_bank_account' } as any);
    expect(result.cardType).toBeNull();
    expect(result.cardLast4).toBeNull();
  });
});

describe('updateTicketTypeQuantitySold', () => {
  it('returns an increment object for the given quantity', () => {
    const result = updateTicketTypeQuantitySold(3);
    expect(result).toEqual({ quantitySold: { increment: 3 } });
  });
});
