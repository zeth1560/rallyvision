import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
      .select('clip_id, email, stripe_checkout_session_id, status')
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
      .select('id, title, slug, booking_id, recorded_at')
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

    return NextResponse.json({
      orders: enrichedOrders,
      email: orders[0]?.email || null,
      bookingId,
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