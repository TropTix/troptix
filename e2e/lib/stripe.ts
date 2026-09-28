import { FAKE_STRIPE_URL } from './env';

export type PaymentIntent = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  livemode: boolean;
};

// What the app's Stripe SDK sent, as the fake server recorded it.
export async function getPaymentIntent(id: string): Promise<PaymentIntent> {
  const res = await fetch(`${FAKE_STRIPE_URL}/v1/payment_intents/${id}`);
  if (!res.ok)
    throw new Error(`fake stripe ${res.status}: ${await res.text()}`);
  return (await res.json()) as PaymentIntent;
}
