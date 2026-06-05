import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { logCartNormalization } from '@/lib/commerce/cart-normalize';
import { claimCheckoutFulfillment } from '@/lib/commerce/fulfillment-lock';
import { runStripeCheckoutFulfillment } from '@/lib/commerce/fulfillment';
import { normalizeCheckoutEmail } from '@/lib/commerce/purchase-validation';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  console.log('=== WEBHOOK ROUTE HIT ===');

  const body = await request.text();
  const headerList = await headers();
  const signature = headerList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Missing STRIPE_WEBHOOK_SECRET in environment');

    return NextResponse.json(
      { error: 'Missing STRIPE_WEBHOOK_SECRET in env' },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log('Webhook verified. Event type:', event.type);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);

    return NextResponse.json(
      { error: 'Invalid webhook signature' },
      { status: 400 }
    );
  }

  try {
    if (event.type !== 'checkout.session.completed') {
      console.log('Ignoring event type:', event.type);
      return NextResponse.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    console.log('Checkout session ID:', session.id);
    console.log('Session metadata keys:', Object.keys(session.metadata ?? {}));

    const email =
      session.customer_details?.email ||
      session.customer_email ||
      null;

    const normalizedEmail = normalizeCheckoutEmail(email);

    if (!normalizedEmail) {
      console.error('Missing customer email on checkout session:', session.id);
      return NextResponse.json({ error: 'Missing customer email' }, { status: 400 });
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null;

    const claimResult = await claimCheckoutFulfillment({
      stripeCheckoutSessionId: session.id,
      email: normalizedEmail,
    });

    if (claimResult === 'already_completed') {
      console.log('Webhook already processed for session:', session.id);
      return NextResponse.json({ received: true });
    }

    logCartNormalization({
      phase: 'webhook_processing',
      stripe_session_id: session.id,
      metadata: session.metadata,
      fulfillment_claim: claimResult,
    });

    await runStripeCheckoutFulfillment({
      session,
      email: normalizedEmail,
      paymentIntentId,
    });

    console.log('Orders recorded for session:', session.id);

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);

    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
