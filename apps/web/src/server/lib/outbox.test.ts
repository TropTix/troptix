// Mock the DB + email/barrel deps so the drainer runs without Resend or Postgres.
jest.mock('@troptix/db', () => ({
  OutboxStatus: { PENDING: 'PENDING', SENT: 'SENT', FAILED: 'FAILED' },
}));

jest.mock('@troptix/api/server', () => ({
  OUTBOX_ORDER_CONFIRMATION: 'order_confirmation',
  OUTBOX_REFUND_NOTICE: 'refund_notice',
}));

jest.mock('./email', () => ({
  sendEmailConfirmationEmailToUser: jest.fn(),
  sendRefundNoticeEmail: jest.fn(),
}));

// Mocks are created inside the factory (hoisted above imports) and grabbed off
// the imported mock below — avoids the "referenced before initialization" trap.
jest.mock('@/server/prisma', () => ({
  __esModule: true,
  default: { outboxMessage: { findMany: jest.fn(), update: jest.fn() } },
}));

import prismaMock from '@/server/prisma';
import { drainOutbox, type OutboxSenders } from './outbox';

const mockFindMany = (
  prismaMock as unknown as {
    outboxMessage: { findMany: jest.Mock; update: jest.Mock };
  }
).outboxMessage.findMany;
const mockUpdate = (
  prismaMock as unknown as {
    outboxMessage: { findMany: jest.Mock; update: jest.Mock };
  }
).outboxMessage.update;

beforeEach(() => {
  mockFindMany.mockReset();
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue({});
});

describe('drainOutbox', () => {
  it('sends a pending message and marks it SENT', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'm1',
        type: 'order_confirmation',
        payload: { orderId: 'o1' },
        attempts: 0,
      },
    ]);
    const send = jest.fn().mockResolvedValue(undefined);
    const senders: OutboxSenders = { order_confirmation: send };

    const result = await drainOutbox(20, senders);

    expect(send).toHaveBeenCalledWith({ orderId: 'o1' });
    expect(result).toEqual({ sent: 1, failed: 0 });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1' },
        data: expect.objectContaining({ status: 'SENT', lastError: null }),
      })
    );
  });

  it('increments attempts and stays PENDING on a transient failure', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'm2',
        type: 'order_confirmation',
        payload: { orderId: 'o2' },
        attempts: 1,
      },
    ]);
    const senders: OutboxSenders = {
      order_confirmation: jest.fn().mockRejectedValue(new Error('Resend 503')),
    };

    const result = await drainOutbox(20, senders);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm2' },
        data: expect.objectContaining({
          attempts: 2,
          status: 'PENDING',
          lastError: 'Resend 503',
        }),
      })
    );
  });

  it('marks FAILED when the final attempt fails (attempts hits MAX)', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'm3',
        type: 'refund_notice',
        payload: { reservationId: 'r3' },
        attempts: 4,
      },
    ]);
    const senders: OutboxSenders = {
      refund_notice: jest.fn().mockRejectedValue(new Error('boom')),
    };

    const result = await drainOutbox(20, senders);

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm3' },
        data: expect.objectContaining({ attempts: 5, status: 'FAILED' }),
      })
    );
  });

  it('fails a message with no registered sender (unknown type)', async () => {
    mockFindMany.mockResolvedValue([
      { id: 'm4', type: 'mystery', payload: {}, attempts: 0 },
    ]);

    const result = await drainOutbox(20, {});

    expect(result).toEqual({ sent: 0, failed: 1 });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attempts: 1,
          lastError: expect.stringContaining('Unknown outbox message type'),
        }),
      })
    );
  });
});
