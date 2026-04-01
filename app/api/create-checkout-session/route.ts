import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/lib/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  try {
    console.log('Create checkout session hit');

    const body = await request.json();
    const { clipId } = body;

    if (!clipId) {
      return NextResponse.json({ error: 'Missing clipId' }, { status: 400 });
    }

    const { data: clip, error } = await supabase
      .from('clips')
      .select('*')
      .eq('id', clipId)
      .eq('published', true)
      .single();

    if (error || !clip) {
      return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (!baseUrl) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_BASE_URL in env' },
        { status: 500 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      billing_address_collection: 'auto',
      customer_creation: 'always',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: clip.title || 'RallyVision Clip',
            },
            unit_amount: clip.price_cents,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/clip/${clip.slug}`,
      metadata: {
        clipId: clip.id,
        slug: clip.slug,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unknown server error',
      },
      { status: 500 }
    );
  }
}