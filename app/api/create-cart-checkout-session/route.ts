import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type RequestBody = {
  clipIds?: string[];
  bookingId?: string;
};

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const rawClipIds = body.clipIds;
    const clientBookingId = body.bookingId;

    if (!rawClipIds || !Array.isArray(rawClipIds) || rawClipIds.length === 0) {
      return NextResponse.json(
        { error: 'No clip IDs provided' },
        { status: 400 }
      );
    }

    const clipIds = Array.from(
      new Set(
        rawClipIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => id.trim())
          .filter(Boolean)
      )
    );

    if (clipIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid clip IDs provided' },
        { status: 400 }
      );
    }

    const hasInvalidClipId = clipIds.some((id) => !uuidRegex.test(id));

    if (hasInvalidClipId) {
      return NextResponse.json(
        { error: 'One or more clip IDs are invalid' },
        { status: 400 }
      );
    }

    const { data: clips, error } = await supabaseAdmin
      .from('clips')
      .select('id, slug, title, price_cents, booking_id, published')
      .in('id', clipIds)
      .eq('published', true);

    if (error) {
      console.error('Supabase clip lookup error:', error);

      return NextResponse.json(
        { error: 'Failed to load selected clips' },
        { status: 500 }
      );
    }

    if (!clips || clips.length === 0) {
      return NextResponse.json(
        { error: 'No valid clips found' },
        { status: 404 }
      );
    }

    if (clips.length !== clipIds.length) {
      return NextResponse.json(
        { error: 'Some selected clips were not found or are not published' },
        { status: 400 }
      );
    }

    const bookingIds = Array.from(
      new Set(
        clips
          .map((clip) => clip.booking_id)
          .filter(
            (bookingId): bookingId is string =>
              typeof bookingId === 'string' && bookingId.trim().length > 0
          )
      )
    );

    if (bookingIds.length !== 1) {
      return NextResponse.json(
        { error: 'Selected clips must all belong to the same booking' },
        { status: 400 }
      );
    }

    const validatedBookingId = bookingIds[0];

    if (clientBookingId && clientBookingId !== validatedBookingId) {
      return NextResponse.json(
        { error: 'Selected clips do not match the current booking' },
        { status: 400 }
      );
    }

    const orderedClips = clipIds.map((id) => {
      const clip = clips.find((item) => item.id === id);

      if (!clip) {
        throw new Error(`Missing clip during checkout preparation: ${id}`);
      }

      return clip;
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (!baseUrl) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_BASE_URL in env' },
        { status: 500 }
      );
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      orderedClips.map((clip) => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: clip.title || 'RallyVision Clip',
            metadata: {
              clipId: clip.id,
              slug: clip.slug,
            },
          },
          unit_amount: clip.price_cents,
        },
        quantity: 1,
      }));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      billing_address_collection: 'auto',
      customer_creation: 'always',
      line_items: lineItems,
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/session/${validatedBookingId}`,
      client_reference_id: validatedBookingId,
      metadata: {
        bookingId: validatedBookingId,
        clipIds: clipIds.join(','),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Cart checkout error:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unknown server error',
      },
      { status: 500 }
    );
  }
}