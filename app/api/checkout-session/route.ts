import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchPlayerTroveVideosForEmail } from '@/lib/player-trove-videos';
import { createPlayerTroveToken } from '@/lib/player-trove-token';
import { autoSubmitPbVisionForSessionClips } from '@/lib/pb-vision-request';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id')?.trim();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing session_id' },
        { status: 400 }
      );
    }

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select(
        'clip_id, email, stripe_checkout_session_id, status, amount_total, currency'
      )
      .eq('stripe_checkout_session_id', sessionId)
      .eq('status', 'paid');

    if (ordersError || !orders || orders.length === 0) {
      return NextResponse.json(
        { error: 'Paid order not found' },
        { status: 404 }
      );
    }

    const clipIds = orders.map((order) => order.clip_id);

    const { data: clips, error: clipsError } = await supabaseAdmin
      .from('clips')
      .select('id, title, slug, booking_id, recorded_at, duration_seconds')
      .in('id', clipIds);

    if (clipsError || !clips || clips.length === 0) {
      return NextResponse.json(
        { error: 'Purchased clips not found' },
        { status: 404 }
      );
    }

    const clipsById = Object.fromEntries(clips.map((clip) => [clip.id, clip]));

    const enrichedOrders = orders.map((order) => ({
      ...order,
      clip: clipsById[order.clip_id] || null,
    }));

    const bookingId = clips[0]?.booking_id || null;

    // Stripe stores the full session total on each order row (not per-clip).
    const rawAmount = orders.find((order) => order.amount_total != null)?.amount_total;
    const sessionAmountTotal =
      rawAmount == null ? null : Number(rawAmount);

    const amountKnown =
      sessionAmountTotal != null && !Number.isNaN(sessionAmountTotal);

    // This route serves Stripe checkout success only (status = paid). Treat as paid
    // unless amount_total is explicitly 0 (e.g. comped / $0 Stripe session).
    const isPaid = amountKnown ? sessionAmountTotal > 0 : true;

    if (!amountKnown) {
      console.warn('[checkout-session] amount_total missing on orders; assuming paid', {
        session_id: sessionId,
        order_count: orders.length,
      });
    }

    const email = orders[0]?.email?.toLowerCase().trim() || null;
    let playerTrove = null;

    if (email) {
      try {
        let troveData = await fetchPlayerTroveVideosForEmail(email);

        await autoSubmitPbVisionForSessionClips({
          email,
          clipIds,
          videos: troveData.videos,
        });

        troveData = await fetchPlayerTroveVideosForEmail(email);
        playerTrove = {
          ...troveData,
          token: createPlayerTroveToken(email),
        };
      } catch (troveError) {
        console.error('[checkout-session] Failed to load PlayerTrove library', {
          session_id: sessionId,
          error: troveError instanceof Error ? troveError.message : troveError,
        });
      }
    }

    return NextResponse.json({
      orders: enrichedOrders,
      email,
      bookingId,
      purchased_clip_ids: clipIds,
      player_trove: playerTrove,
      total_amount_cents: amountKnown ? sessionAmountTotal : null,
      amount_known: amountKnown,
      is_paid: isPaid,
      currency: orders.find((order) => order.currency)?.currency ?? null,
    });
  } catch (error) {
    console.error('Checkout session lookup error:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Something went wrong',
      },
      { status: 500 }
    );
  }
}