import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  buildStripeCheckoutFromRequest,
  parseCheckoutBuildOptions,
  parseCheckoutRequestBody,
  PromoValidationError,
  PurchaseValidationError,
} from '@/lib/commerce/checkout';
import { linkCheckoutCartToStripeSession } from '@/lib/commerce/checkout-cart';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedRequest = parseCheckoutRequestBody(body);

    if (!parsedRequest) {
      return NextResponse.json(
        { error: 'No clip IDs or cart payload were provided.' },
        { status: 400 }
      );
    }

    const buildOptions = parseCheckoutBuildOptions(body);
    const checkout = await buildStripeCheckoutFromRequest(
      parsedRequest,
      buildOptions
    );

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: buildOptions.customerEmail ?? undefined,
      line_items: checkout.lineItems,
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: parsedRequest.bookingId
        ? `${appUrl}/session/${encodeURIComponent(parsedRequest.bookingId)}`
        : `${appUrl}/`,
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

    console.error('create-cart-checkout-session error:', error);

    return NextResponse.json(
      { error: 'Failed to create checkout session.' },
      { status: 500 }
    );
  }
}
