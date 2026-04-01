import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createSignedDownloadUrl } from '@/lib/s3';

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const stripeSessionRegex = /^cs_(test|live)_[A-Za-z0-9]+$/;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clipId = searchParams.get('clip_id');
    const sessionId = searchParams.get('session_id');

    if (!clipId || !sessionId) {
      return NextResponse.json(
        { error: 'Missing clip_id or session_id' },
        { status: 400 }
      );
    }

    if (!uuidRegex.test(clipId)) {
      return NextResponse.json(
        { error: 'Invalid clip_id' },
        { status: 400 }
      );
    }

    if (!stripeSessionRegex.test(sessionId)) {
      return NextResponse.json(
        { error: 'Invalid session_id' },
        { status: 400 }
      );
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id')
      .eq('clip_id', clipId)
      .eq('stripe_checkout_session_id', sessionId)
      .eq('status', 'paid')
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'You do not have access to this clip' },
        { status: 403 }
      );
    }

    const { data: clip, error: clipError } = await supabase
      .from('clips')
      .select('id, title, s3_key')
      .eq('id', clipId)
      .single();

    if (clipError || !clip) {
      return NextResponse.json(
        { error: 'Clip not found' },
        { status: 404 }
      );
    }

    if (!clip.s3_key) {
      return NextResponse.json(
        { error: 'No s3_key found for this clip' },
        { status: 400 }
      );
    }

    const signedUrl = await createSignedDownloadUrl(clip.s3_key);

    return NextResponse.json({
      downloadUrl: signedUrl,
      clipTitle: clip.title,
    });
  } catch (error) {
    console.error('Download route error:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Something went wrong',
      },
      { status: 500 }
    );
  }
}