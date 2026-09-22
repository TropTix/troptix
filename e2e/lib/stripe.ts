export type PaymentIntent = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  livemode: boolean;
};

export async function getPaymentIntent(id: string): Promise<PaymentIntent> {
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${id}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${await res.text()}`);
  return (await res.json()) as PaymentIntent;
}
