import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendPurchaseConfirmationEmail } from '@/lib/email';

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
    console.log('Session metadata:', session.metadata);

    const email =
      session.customer_details?.email ||
      session.customer_email ||
      null;

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null;

    const rawClipIds = session.metadata?.clipIds ?? '';
    const singleClipId = session.metadata?.clipId ?? '';

    const clipIds = rawClipIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (clipIds.length === 0 && singleClipId.trim()) {
      clipIds.push(singleClipId.trim());
    }

    if (clipIds.length === 0) {
      console.error('Missing clipIds/clipId in session metadata');

      return NextResponse.json(
        { error: 'Missing clip metadata' },
        { status: 400 }
      );
    }

    const { data: existingOrders, error: existingOrdersError } =
      await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('stripe_checkout_session_id', session.id)
        .limit(1);

    if (existingOrdersError) {
      console.error(
        'Failed to check for existing orders:',
        existingOrdersError
      );

      return NextResponse.json(
        { error: 'Failed to verify existing orders' },
        { status: 500 }
      );
    }

    if (existingOrders && existingOrders.length > 0) {
      console.log('Webhook already processed for session:', session.id);
      return NextResponse.json({ received: true });
    }

    const { data: purchasedClips, error: purchasedClipsError } =
      await supabaseAdmin
        .from('clips')
        .select('id, title, slug')
        .in('id', clipIds);

    if (purchasedClipsError) {
      console.error('Failed to load purchased clips:', purchasedClipsError);

      return NextResponse.json(
        { error: 'Failed to load purchased clips' },
        { status: 500 }
      );
    }

    if (!purchasedClips || purchasedClips.length === 0) {
      console.error('No matching clips found for webhook clipIds:', clipIds);

      return NextResponse.json(
        { error: 'No matching clips found' },
        { status: 404 }
      );
    }

    const rows = purchasedClips.map((clip) => ({
      clip_id: clip.id,
      email,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      amount_total: session.amount_total,
      currency: session.currency,
      status: 'paid',
    }));

    const { data: insertedOrders, error: insertError } = await supabaseAdmin
      .from('orders')
      .insert(rows)
      .select();

    console.log('Supabase insert data:', insertedOrders);
    console.log('Supabase insert error:', insertError);

    if (insertError) {
      return NextResponse.json(
        { error: 'Database write failed' },
        { status: 500 }
      );
    }

    if (email) {
      try {
        await sendPurchaseConfirmationEmail({
          to: email,
          sessionId: session.id,
          clips: purchasedClips.map((clip) => ({
            title: clip.title,
            slug: clip.slug,
          })),
        });

        console.log('Purchase confirmation email sent to:', email);
      } catch (emailError) {
        console.error('Failed to send purchase email:', emailError);
      }
    }

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