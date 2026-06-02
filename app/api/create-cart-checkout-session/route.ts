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

    const totalPriceCents = resolvedClips.reduce(
      (sum, clip) => sum + (clip.resolved_price_cents ?? 0),
      0
    );

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000';

    // =========================================================================
    // FREE CLIPS: MUST use /api/player-trove/claim-free endpoint instead
    // =========================================================================
    if (totalPriceCents === 0) {
      console.error('[SECURITY] Attempt to checkout free cart (all free clips) via paid flow', {
        clip_ids: resolvedClips.map((c) => c.id),
        total_price_cents: totalPriceCents,
        timestamp: new Date().toISOString(),
        note: 'Free clips must be claimed individually via /api/player-trove/claim-free with email',
      });

      return NextResponse.json(
        {
          error: 'Carts containing only free clips cannot be purchased through checkout. Claim each free clip individually using the "Claim Free Access" option with your email instead.',
          errorCode: 'FREE_CLIPS_CART_BYPASS_ATTEMPT',
        },
        { status: 400 }
      );
    }

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