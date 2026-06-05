import { VercelRequest, VercelResponse } from '@vercel/node';
import { allowCors } from '@/server/lib/auth';
import prisma from '@/server/prisma';
import { stripe, MOBILE_STRIPE_API_VERSION } from '@/server/lib/stripe';

async function handler(request: VercelRequest, response: VercelResponse) {
  const { method } = request;

  if (method === undefined) {
    return response
      .status(500)
      .json({ error: 'No method found for stripe endpoint' });
  }

  switch (method) {
    case 'POST':
      return postOrders(request, response);
    case 'OPTIONS':
      return response.status(200).end();
    default:
      return response.status(500).json('No type set');
  }
}

export default allowCors(handler);

async function postOrders(request, response) {
  const { body } = request;

  if (body === undefined || body.type === undefined) {
    return response
      .status(500)
      .json({ error: 'No body found in post orders request' });
  }

  const postOrderType = body.type;

  switch (String(postOrderType)) {
    case 'CREATE_CHARGE':
      return createCharge(body, response);
    default:
      return response.status(500).json({ error: 'No post order type set' });
  }
}

async function createCharge(body, response) {
  const charge = body.charge;

  if (charge === undefined || charge.total === undefined) {
    return response
      .status(500)
      .json({ error: 'No body found in create charge request' });
  }

  try {
    var customerId = '';

    if (!charge.userId) {
      const customer = await stripe.customers.create({
        name: charge?.name,
        email: charge?.email,
      });
      customerId = customer.id;
    } else {
      const user = await prisma.users.findUnique({
        where: {
          id: charge.userId,
        },
      });

      if (!user?.stripeId) {
        const customer = await stripe.customers.create({
          name: charge?.name,
          email: charge?.email,
        });
        await prisma.users.update({
          where: {
            id: charge.userId,
          },
          data: {
            stripeId: customer.id,
          },
        });

        customerId = customer.id;
      } else {
        customerId = user.stripeId;
      }
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: MOBILE_STRIPE_API_VERSION }
    );

    const paymentIntent = await stripe.paymentIntents.create({
      amount: charge.total,
      currency: 'usd',
      customer: customerId,
      // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return response.status(200).json({
      paymentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customerId: customerId,
    });
  } catch (error) {
    console.log('ERROR in createCharge:', error);
    console.log('Error details:', JSON.stringify(error, null, 2));
    return response.status(500).json({ error: error });
  }
}
