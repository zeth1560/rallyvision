import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  readPlayerTroveTokenFromRequest,
  verifyPlayerTroveRequestToken,
} from '@/lib/player-trove-auth';
import {
  buildStripeCheckoutFromRequest,
  parseCheckoutBuildOptions,
  PromoValidationError,
  PurchaseValidationError,
} from '@/lib/commerce/checkout';
import { linkCheckoutCartToStripeSession } from '@/lib/commerce/checkout-cart';
import {
  buildUpsellCartPayload,
  validateUpsellPurchaseRequest,
} from '@/lib/commerce/player-trove-upsell';
import { isProductType, type ProductType } from '@/lib/commerce/products';
import type { AccessEntitlementRow } from '@/lib/commerce/entitlements';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

type ClipSummary = {
  id: string;
  booking_id: string | null;
  duration_seconds: number | null;
  published: boolean | null;
};

type AccessRow = AccessEntitlementRow & {
  id: string;
  email: string;
  clip_id: string;
  access_status: string;
  clips: ClipSummary | ClipSummary[] | null;
};

function normalizeClipRelation(clips: AccessRow['clips']): ClipSummary {
  if (!clips) {
    throw new Error('Clip not found');
  }

  return Array.isArray(clips) ? clips[0] : clips;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const accessId =
      typeof body?.access_id === 'string' ? body.access_id.trim() : '';

    const productsRaw = Array.isArray(body?.products) ? body.products : [];
    const products = productsRaw.filter(
      (value: unknown): value is ProductType =>
        typeof value === 'string' && isProductType(value)
    );

    if (!accessId) {
      return NextResponse.json({ error: 'access_id is required' }, { status: 400 });
    }

    const token = readPlayerTroveTokenFromRequest(request, body?.token);

    let viewerEmail: string | null = null;

    if (token) {
      const verified = verifyPlayerTroveRequestToken(token);
      if (!verified.ok) {
        return NextResponse.json({ error: verified.error }, { status: verified.status });
      }
      viewerEmail = verified.email;
    } else if (process.env.NODE_ENV !== 'production') {
      const emailParam =
        typeof body?.email === 'string'
          ? body.email.trim().toLowerCase()
          : request.nextUrl.searchParams.get('email')?.trim().toLowerCase() ?? '';

      if (emailParam) {
        viewerEmail = emailParam;
      }
    }

    if (!viewerEmail) {
      return NextResponse.json(
        { error: 'A secure access link is required to purchase' },
        { status: 401 }
      );
    }

    const { data: accessData, error: accessError } = await supabaseAdmin
      .from('player_video_access')
      .select(`
        id,
        email,
        clip_id,
        access_status,
        clip_download_purchased_at,
        hd_download_purchased_at,
        pb_vision_purchased_at,
        coach_review_purchased_at,
        download_expires_at,
        pb_vision_expires_at,
        coach_review_expires_at,
        clips (
          id,
          booking_id,
          duration_seconds,
          published
        )
      `)
      .eq('id', accessId)
      .maybeSingle();

    if (accessError || !accessData) {
      return NextResponse.json({ error: 'Access record not found' }, { status: 404 });
    }

    const access = accessData as AccessRow;

    if (access.email.toLowerCase() !== viewerEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (access.access_status !== 'active') {
      return NextResponse.json({ error: 'Access is not active' }, { status: 400 });
    }

    const clip = normalizeClipRelation(access.clips);

    if (!clip?.published) {
      return NextResponse.json({ error: 'Clip is not available' }, { status: 400 });
    }

    const validation = validateUpsellPurchaseRequest(
      access,
      clip,
      products
    );

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const cart = buildUpsellCartPayload(
      access.clip_id,
      clip.booking_id,
      validation.products
    );

    const promoCode =
      typeof body?.promoCode === 'string'
        ? body.promoCode.trim()
        : typeof body?.promo_code === 'string'
          ? body.promo_code.trim()
          : null;

    const checkout = await buildStripeCheckoutFromRequest(
      {
        mode: 'structured',
        bookingId: clip.booking_id ?? '',
        cart,
      },
      {
        promoCode,
        customerEmail: viewerEmail,
      }
    );

    const appUrl = (
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '');

    const returnParams = token
      ? `token=${encodeURIComponent(token)}`
      : `email=${encodeURIComponent(viewerEmail)}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: viewerEmail,
      line_items: checkout.lineItems,
      success_url: `${appUrl}/player-trove?${returnParams}&purchased=1`,
      cancel_url: `${appUrl}/player-trove?${returnParams}`,
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

    const message = error instanceof Error ? error.message : 'Checkout failed';

    console.error('[PlayerTrove Checkout] error:', error);

    return NextResponse.json(
      {
        error:
          message === 'Checkout failed'
            ? 'Failed to create checkout session'
            : message,
      },
      { status: 500 }
    );
  }
}
