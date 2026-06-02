import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolvePricesForClips } from '@/lib/pricing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

type ClipRow = {
  id: string;
  slug: string | null;
  title: string | null;
  recorded_at: string | null;
  price_cents: number | null;
  club_id: string | null;
  court_id: string | null;
  booking_id: string | null;
  published: boolean | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const clipIdsRaw = Array.isArray(body?.clipIds) ? body.clipIds : [];
    const bookingId =
      typeof body?.bookingId === 'string' ? body.bookingId.trim() : '';

    const clipIds = clipIdsRaw
      .filter((value: unknown): value is string => typeof value === 'string')
      .map((value: string) => value.trim())
      .filter((value: string) => value.length > 0);

    if (clipIds.length === 0) {
      return NextResponse.json(
        { error: 'No clip IDs were provided.' },
        { status: 400 }
      );
    }

    const { data: clipsData, error: clipsError } = await supabaseAdmin
      .from('clips')
      .select(
        'id, slug, title, recorded_at, price_cents, club_id, court_id, booking_id, published, duration_seconds'
      )
      .in('id', clipIds)
      .eq('published', true);

    if (clipsError) {
      return NextResponse.json(
        { error: clipsError.message },
        { status: 500 }
      );
    }

    const clips = (clipsData ?? []) as ClipRow[];

    if (clips.length === 0) {
      return NextResponse.json(
        { error: 'No purchasable clips were found.' },
        { status: 404 }
      );
    }

    const resolvedClips = await resolvePricesForClips(clips);

    console.log('[CART_CHECKOUT] Clips resolved', {
      clip_count: resolvedClips.length,
      resolved_prices: resolvedClips.map((c) => ({
        id: c.id,
        price_cents: c.resolved_price_cents,
        source: c.resolved_price_source,
      })),
      timestamp: new Date().toISOString(),
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000';

    // =========================================================================
    // CHECK FOR MIXED CARTS (both free and paid)
    // =========================================================================
    const freeClips = resolvedClips.filter(
      (c) => (c.resolved_price_cents ?? 0) === 0
    );
    const paidClips = resolvedClips.filter(
      (c) => (c.resolved_price_cents ?? 0) > 0
    );

    if (freeClips.length > 0 && paidClips.length > 0) {
      console.warn('[CART_CHECKOUT] Mixed cart (free + paid) not supported', {
        free_clip_ids: freeClips.map((c) => c.id),
        paid_clip_ids: paidClips.map((c) => c.id),
        total_clips: resolvedClips.length,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          error: 'Please check out free and paid clips separately',
          errorCode: 'MIXED_CART_NOT_SUPPORTED',
          free_clip_ids: freeClips.map((c) => c.id),
          paid_clip_ids: paidClips.map((c) => c.id),
        },
        { status: 400 }
      );
    }

    // =========================================================================
    // FREE CLIPS: MUST use /api/checkout/free endpoint instead
    // =========================================================================
    if (freeClips.length > 0) {
      console.warn('[CART_CHECKOUT] All-free cart attempting paid flow', {
        clip_ids: freeClips.map((c) => c.id),
        timestamp: new Date().toISOString(),
        note: 'Redirect to /api/checkout/free with email',
      });

      return NextResponse.json(
        {
          error: 'Free clips must be checked out using the free checkout flow',
          errorCode: 'FREE_CART_MUST_USE_FREE_CHECKOUT',
          redirect_to: '/api/checkout/free',
        },
        { status: 400 }
      );
    }

    // =========================================================================
    // PAID CHECKOUT (Stripe)
    // =========================================================================
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      resolvedClips.map((clip) => ({
        quantity: 1,
        price_data: {
          currency: 'usd',
          product_data: {
            name: clip.title || 'ReplayTrove Clip',
          },
          unit_amount: clip.resolved_price_cents,
        },
      }));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: bookingId
        ? `${appUrl}/session/${encodeURIComponent(bookingId)}`
        : `${appUrl}/`,
      metadata: {
        clipIds: resolvedClips.map((clip) => clip.id).join(','),
        bookingId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('create-cart-checkout-session error:', error);

    return NextResponse.json(
      { error: 'Failed to create checkout session.' },
      { status: 500 }
    );
  }
}