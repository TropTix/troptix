import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { FAKE_STRIPE_PORT } from '../lib/env';

// A stand-in for api.stripe.com covering only what the buyer flow calls:
// Checkout Sessions (create, retrieve, expire), refunds, and PaymentIntent
// retrieval. State lives in memory for the run. The Stripe.js shim
// (../lib/fake-stripe-js.js) confirms payments through /e2e/confirm, and the
// card number decides the outcome the way Stripe's test cards do.

type Session = {
  id: string;
  object: 'checkout.session';
  client_secret: string;
  status: 'open' | 'complete' | 'expired';
  payment_status: 'unpaid' | 'paid';
  payment_intent: string | null;
  amount_total: number;
  currency: 'usd';
  livemode: false;
  mode: 'payment';
  ui_mode: string;
  metadata: Record<string, string>;
  return_url: string | null;
  customer_email: string | null;
};

type PaymentIntent = {
  id: string;
  object: 'payment_intent';
  status: 'succeeded';
  amount: number;
  currency: 'usd';
  livemode: false;
};

const DECLINES: Record<string, string> = {
  '4000000000000002': 'generic_decline',
  '4000000000009995': 'insufficient_funds',
};

const sessions = new Map<string, Session>();
const paymentIntents = new Map<string, PaymentIntent>();
const idempotent = new Map<string, Session>();

const id = (prefix: string) => `${prefix}_${randomBytes(12).toString('hex')}`;

// Stripe's SDK sends bodies as form data with bracketed keys
// (line_items[0][price_data][unit_amount]=2500).
function parseForm(raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(raw)) {
    const path = key.replace(/\]/g, '').split('[');
    let node = out;
    path.forEach((part, i) => {
      if (i === path.length - 1) node[part] = value;
      else node = (node[part] ??= {}) as Record<string, unknown>;
    });
  }
  return out;
}

function amountOf(lineItems: unknown): number {
  if (!lineItems || typeof lineItems !== 'object') return 0;
  return Object.values(lineItems as Record<string, unknown>).reduce<number>(
    (sum, item) => {
      const li = item as {
        quantity?: string;
        price_data?: { unit_amount?: string };
      };
      return (
        sum + Number(li.quantity ?? 0) * Number(li.price_data?.unit_amount ?? 0)
      );
    },
    0
  );
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function stripeError(
  res: http.ServerResponse,
  status: number,
  message: string
) {
  send(res, status, { error: { type: 'invalid_request_error', message } });
}

function createSession(form: Record<string, unknown>): Session {
  const sessionId = id('cs_test');
  return {
    id: sessionId,
    object: 'checkout.session',
    client_secret: `${sessionId}_secret_${randomBytes(8).toString('hex')}`,
    status: 'open',
    payment_status: 'unpaid',
    payment_intent: null,
    amount_total: amountOf(form.line_items),
    currency: 'usd',
    livemode: false,
    mode: 'payment',
    ui_mode: String(form.ui_mode ?? 'elements'),
    metadata: (form.metadata as Record<string, string>) ?? {},
    return_url: (form.return_url as string) ?? null,
    customer_email: (form.customer_email as string) ?? null,
  };
}

function confirm(session: Session, card: string) {
  const declineCode = DECLINES[card];
  if (declineCode) return { declined: true, declineCode };
  const intent: PaymentIntent = {
    id: id('pi'),
    object: 'payment_intent',
    status: 'succeeded',
    amount: session.amount_total,
    currency: 'usd',
    livemode: false,
  };
  paymentIntents.set(intent.id, intent);
  session.payment_intent = intent.id;
  session.payment_status = 'paid';
  session.status = 'complete';
  return { declined: false, paymentIntent: intent.id };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';
  if (method === 'OPTIONS') return send(res, 204, {});
  if (url.pathname === '/health') return send(res, 200, { ok: true });

  const raw = await readBody(req);
  const sessionMatch = url.pathname.match(
    /^\/v1\/checkout\/sessions(?:\/([^/]+))?(?:\/(expire))?$/
  );

  if (sessionMatch) {
    const [, sessionId, action] = sessionMatch;
    if (method === 'POST' && !sessionId) {
      const key = req.headers['idempotency-key'];
      const replay = typeof key === 'string' ? idempotent.get(key) : undefined;
      if (replay) return send(res, 200, replay);
      const session = createSession(parseForm(raw));
      sessions.set(session.id, session);
      if (typeof key === 'string') idempotent.set(key, session);
      return send(res, 200, session);
    }
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!session) {
      return stripeError(res, 404, `No such checkout.session: '${sessionId}'`);
    }
    if (method === 'GET' && !action) return send(res, 200, session);
    if (method === 'POST' && action === 'expire') {
      if (session.status !== 'open') {
        return stripeError(
          res,
          400,
          'Only open Checkout Sessions can be expired.'
        );
      }
      session.status = 'expired';
      return send(res, 200, session);
    }
  }

  const intentMatch = url.pathname.match(/^\/v1\/payment_intents\/([^/]+)$/);
  if (intentMatch && method === 'GET') {
    const intent = paymentIntents.get(intentMatch[1]);
    return intent
      ? send(res, 200, intent)
      : stripeError(res, 404, `No such payment_intent: '${intentMatch[1]}'`);
  }

  if (url.pathname === '/v1/refunds' && method === 'POST') {
    const form = parseForm(raw);
    return send(res, 200, {
      id: id('re'),
      object: 'refund',
      status: 'succeeded',
      payment_intent: form.payment_intent ?? null,
    });
  }

  if (url.pathname === '/e2e/confirm' && method === 'POST') {
    const { clientSecret, card } = JSON.parse(raw) as {
      clientSecret: string;
      card: string;
    };
    const session = [...sessions.values()].find(
      (s) => s.client_secret === clientSecret
    );
    if (!session)
      return stripeError(res, 404, 'No session for that client secret.');
    if (session.status !== 'open') {
      return stripeError(res, 400, `Session is ${session.status}.`);
    }
    return send(res, 200, confirm(session, card));
  }

  return stripeError(
    res,
    404,
    `Unrecognized request URL (${method}: ${url.pathname})`
  );
});

server.listen(FAKE_STRIPE_PORT, '127.0.0.1', () => {
  console.log(`fake stripe listening on http://127.0.0.1:${FAKE_STRIPE_PORT}`);
});
