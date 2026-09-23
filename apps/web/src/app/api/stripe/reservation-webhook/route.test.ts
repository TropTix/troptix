/** @jest-environment node */
import Stripe from 'stripe';

const mockPrisma = {
  processedStripeEvent: { findUnique: jest.fn(), create: jest.fn() },
};
const mockConfirmPaid = jest.fn();
const mockSendConfirmation = jest.fn();
const mockSendRefundNotice = jest.fn();
const mockAfterTasks: Promise<unknown>[] = [];

jest.mock('@/server/prisma', () => ({ __esModule: true, default: mockPrisma }));
jest.mock('@troptix/api/server', () => ({
  confirmPaid: mockConfirmPaid,
  paymentIntentIdOf: (session: { payment_intent?: string | { id: string } }) =>
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null),
}));
jest.mock('@/server/lib/email', () => ({
  sendEmailConfirmationEmailToUser: mockSendConfirmation,
  sendRefundNoticeEmail: mockSendRefundNotice,
}));
jest.mock('@/server/lib/analytics', () => ({
  serverAnalytics: () => undefined,
}));
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: (task: unknown) => {
    mockAfterTasks.push(
      Promise.resolve(typeof task === 'function' ? task() : task)
    );
  },
}));

const SECRET = 'whsec_test_secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_RESERVATION_WEBHOOK_SECRET = SECRET;

const stripe = new Stripe('sk_test_dummy');

function completedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_1',
        object: 'checkout.session',
        payment_status: 'paid',
        payment_intent: 'pi_1',
        metadata: { reservationId: 'res_1', eventId: 'ev_1' },
        ...overrides,
      },
    },
  };
}

async function post(payload: unknown, signature?: string) {
  const body = JSON.stringify(payload);
  const sig =
    signature ??
    stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });
  const { POST } = await import('./route');
  return POST(
    new Request('http://localhost/api/stripe/reservation-webhook', {
      method: 'POST',
      body,
      headers: { 'stripe-signature': sig },
    })
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAfterTasks.length = 0;
  mockPrisma.processedStripeEvent.findUnique.mockResolvedValue(null);
  mockPrisma.processedStripeEvent.create.mockResolvedValue({});
});

describe('reservation webhook', () => {
  it('settles, records the event, answers 200, and emails after the response', async () => {
    mockConfirmPaid.mockResolvedValue({
      kind: 'order',
      orderId: 'ord_1',
      tickets: [],
    });

    const res = await post(completedEvent());

    expect(res.status).toBe(200);
    expect(mockPrisma.processedStripeEvent.create).toHaveBeenCalledWith({
      data: { id: 'evt_1', type: 'checkout.session.completed' },
    });
    expect(mockConfirmPaid).toHaveBeenCalledWith(
      mockPrisma,
      expect.anything(),
      {
        reservationId: 'res_1',
        paymentIntentId: 'pi_1',
        fulfilledVia: 'webhook',
      },
      undefined
    );
    await Promise.all(mockAfterTasks);
    expect(mockSendConfirmation).toHaveBeenCalledWith('ord_1');
  });

  it('is a no-op on a redelivery of an event already recorded', async () => {
    mockPrisma.processedStripeEvent.findUnique.mockResolvedValue({
      id: 'evt_1',
    });

    const res = await post(completedEvent());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(mockConfirmPaid).not.toHaveBeenCalled();
  });

  it('records nothing and answers 500 when settling fails, so Stripe retries', async () => {
    mockConfirmPaid.mockRejectedValue(new Error('db down'));

    const res = await post(completedEvent());

    expect(res.status).toBe(500);
    expect(mockPrisma.processedStripeEvent.create).not.toHaveBeenCalled();
    expect(mockSendConfirmation).not.toHaveBeenCalled();
  });

  it('acknowledges an unpaid completion without settling', async () => {
    const res = await post(completedEvent({ payment_status: 'unpaid' }));

    expect(res.status).toBe(200);
    expect(mockConfirmPaid).not.toHaveBeenCalled();
  });

  it('rejects a bad signature before touching the database', async () => {
    const res = await post(completedEvent(), 't=1,v1=bad');

    expect(res.status).toBe(400);
    expect(mockPrisma.processedStripeEvent.findUnique).not.toHaveBeenCalled();
  });
});
