import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveClipPrice } from '@/lib/pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

type ClipRow = {
  id: string;
  slug: string | null;
  title: string | null;
  price_cents: number | null;
  club_id: string | null;
  court_id: string | null;
  booking_id: string | null;
  published: boolean | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const clipId = typeof body?.clipId === 'string' ? body.clipId.trim() : '';

    if (!clipId) {
      return NextResponse.json(
        { error: 'Clip ID is required.' },
        { status: 400 }
      );
    }

    const { data: clipData, error: clipError } = await supabaseAdmin
      .from('clips')
      .select(
        'id, slug, title, price_cents, club_id, court_id, booking_id, published'
      )
      .eq('id', clipId)
      .eq('published', true)
      .single();

    if (clipError || !clipData) {
      return NextResponse.json(
        { error: 'Clip not found.' },
        { status: 404 }
      );
    }

    const clip = clipData as ClipRow;

    const pricing = await resolveClipPrice({
      clipId: clip.id,
      clubId: clip.club_id ?? null,
      courtId: clip.court_id ?? null,
      fallbackPriceCents: clip.price_cents ?? 0,
    });

    const resolvedPriceCents = pricing.priceCents;

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000';

    // -----------------------------
    // FREE PATH: no Stripe
    // -----------------------------
    if (resolvedPriceCents === 0) {
      const syntheticSessionId = `free_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;

      const { error: orderError } = await supabaseAdmin.from('orders').insert({
        clip_id: clip.id,
        email: null,
        stripe_checkout_session_id: syntheticSessionId,
        stripe_payment_intent_id: null,
        amount_total: 0,
        currency: 'usd',
        status: 'paid',
      });

      if (orderError) {
        return NextResponse.json(
          { error: orderError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        url: `${appUrl}/success?session_id=${encodeURIComponent(
          syntheticSessionId
        )}`,
      });
    }

    // -----------------------------
    // PAID PATH: Stripe checkout
    // -----------------------------
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            product_data: {
              name: clip.title || 'ReplayTrove Clip',
            },
            unit_amount: resolvedPriceCents,
          },
        },
      ],
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: clip.slug ? `${appUrl}/clip/${clip.slug}` : `${appUrl}/`,
      metadata: {
        clipIds: clip.id,
        bookingId: clip.booking_id ?? '',
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('create-checkout-session error:', error);

    return NextResponse.json(
      { error: 'Failed to create checkout session.' },
      { status: 500 }
    );
  }
}