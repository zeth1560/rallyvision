import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  buildStripeCheckoutFromRequest,
  parseCheckoutBuildOptions,
  PromoValidationError,
  PurchaseValidationError,
} from '@/lib/commerce/checkout';
import { linkCheckoutCartToStripeSession } from '@/lib/commerce/checkout-cart';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

type ClipRow = {
  id: string;
  slug: string | null;
  booking_id: string | null;
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
      .select('id, slug, booking_id, published')
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

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000';

    const buildOptions = parseCheckoutBuildOptions(body);

    let checkout;

    try {
      checkout = await buildStripeCheckoutFromRequest(
        {
          mode: 'legacy',
          clipIds: [clipId],
          bookingId: clip.booking_id ?? '',
        },
        buildOptions
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Checkout failed';

      if (message === 'FREE_CART_MUST_USE_FREE_CHECKOUT') {
        console.error('[SECURITY] Attempt to checkout free clip via paid flow', {
          clip_id: clip.id,
          timestamp: new Date().toISOString(),
          note: 'Free clips must use /api/player-trove/claim-free endpoint with email',
        });

        return NextResponse.json(
          {
            error:
              'Free clips cannot be purchased through checkout. Use the "Claim Free Access" option with your email instead.',
            errorCode: 'FREE_CLIP_BYPASS_ATTEMPT',
          },
          { status: 400 }
        );
      }

      throw error;
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_collection: 'if_required',
      customer_email: buildOptions.customerEmail ?? undefined,
      line_items: checkout.lineItems,
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: clip.slug ? `${appUrl}/clip/${clip.slug}` : `${appUrl}/`,
      metadata: checkout.metadata,
    });

    await linkCheckoutCartToStripeSession(checkout.checkoutCartId, session.id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof PromoValidationError) {
      return NextResponse.json(
        { error: error.message, errorCode: error.code },
        { status: 400 }
      );
    }

    if (error instanceof PurchaseValidationError) {
      return NextResponse.json(
        { error: error.message, errorCode: error.code },
        { status: 400 }
      );
    }

    console.error('create-checkout-session error:', error);

    return NextResponse.json(
      { error: 'Failed to create checkout session.' },
      { status: 500 }
    );
  }
}
