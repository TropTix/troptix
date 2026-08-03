// Verifies the charge on Stripe's side with a bare API call — no SDK needed
// for one GET. Requires the same test-mode/sandbox secret key the deployment
// under test uses.
export type PaymentIntent = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  livemode: boolean;
};

export function stripeKeyAvailable(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export async function getPaymentIntent(id: string): Promise<PaymentIntent> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw new Error(
      `Stripe payment_intents/${id} returned ${res.status}: ${await res.text()}`
    );
  }
  return (await res.json()) as PaymentIntent;
}
