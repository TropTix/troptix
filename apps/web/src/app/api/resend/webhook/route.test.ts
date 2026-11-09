/** @jest-environment node */
import { createHmac } from 'node:crypto';

const mockRecordDeliveryEvent = jest.fn();
const mockCaptureEmailFailed = jest.fn();
const mockAfterTasks: Promise<unknown>[] = [];

jest.mock('@/server/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@troptix/api/server', () => ({
  recordDeliveryEvent: mockRecordDeliveryEvent,
  UNDELIVERED_STATUSES: ['BOUNCED', 'SUPPRESSED', 'FAILED', 'COMPLAINED'],
}));
jest.mock('@/server/lib/email', () => {
  const { Resend } = jest.requireActual('resend');
  return { resend: new Resend('re_test') };
});
jest.mock('@/server/lib/analytics', () => ({
  captureEmailFailed: mockCaptureEmailFailed,
}));
jest.mock('next/server', () => ({
  ...jest.requireActual('next/server'),
  after: (task: () => unknown) => {
    mockAfterTasks.push(Promise.resolve(task()));
  },
}));

const SECRET_BYTES = Buffer.from('test-signing-secret-32-bytes!!!!');
process.env.RESEND_WEBHOOK_SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;

function sign(id: string, timestamp: string, payload: string) {
  const mac = createHmac('sha256', SECRET_BYTES)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return `v1,${mac}`;
}

async function post(event: unknown, signature?: string) {
  const payload = JSON.stringify(event);
  const id = 'msg_1';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const { POST } = await import('./route');
  return POST(
    new Request('http://localhost/api/resend/webhook', {
      method: 'POST',
      body: payload,
      headers: {
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': signature ?? sign(id, timestamp, payload),
      },
    })
  );
}

function emailEvent(type: string) {
  return {
    type,
    created_at: '2026-11-07T12:00:00.000Z',
    data: {
      email_id: 're_1',
      created_at: '2026-11-07T11:59:00.000Z',
      from: 'TropTix <info@usetroptix.com>',
      to: ['buyer@example.com'],
      subject: 'Order Confirmation',
      tags: { email_id: 'email-1' },
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAfterTasks.length = 0;
});

describe('Resend webhook', () => {
  it('records a delivery against the row', async () => {
    mockRecordDeliveryEvent.mockResolvedValue({
      id: 'email-1',
      type: 'order_confirmation',
      status: 'DELIVERED',
    });

    const res = await post(emailEvent('email.delivered'));

    expect(res.status).toBe(200);
    expect(mockRecordDeliveryEvent).toHaveBeenCalledWith(
      {},
      {
        type: 'email.delivered',
        resendId: 're_1',
        emailId: 'email-1',
        at: new Date('2026-11-07T12:00:00.000Z'),
      }
    );
    await Promise.all(mockAfterTasks);
    expect(mockCaptureEmailFailed).not.toHaveBeenCalled();
  });

  it('reports a bounce to PostHog', async () => {
    mockRecordDeliveryEvent.mockResolvedValue({
      id: 'email-1',
      type: 'order_confirmation',
      status: 'BOUNCED',
    });

    await post(emailEvent('email.bounced'));

    await Promise.all(mockAfterTasks);
    expect(mockCaptureEmailFailed).toHaveBeenCalledWith({
      emailId: 'email-1',
      type: 'order_confirmation',
      status: 'BOUNCED',
    });
  });

  it('rejects a bad signature without touching the database', async () => {
    const res = await post(emailEvent('email.delivered'), 'v1,bad');

    expect(res.status).toBe(400);
    expect(mockRecordDeliveryEvent).not.toHaveBeenCalled();
  });

  it('acknowledges events that are not about an email', async () => {
    const res = await post({
      type: 'domain.updated',
      created_at: '2026-11-07T12:00:00.000Z',
      data: { id: 'd_1', name: 'usetroptix.com' },
    });

    expect(res.status).toBe(200);
    expect(mockRecordDeliveryEvent).not.toHaveBeenCalled();
  });
});
