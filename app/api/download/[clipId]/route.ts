import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSignedDownloadUrl } from '@/lib/s3';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> }
) {
  const { clipId } = await params;
  const sessionId = request.nextUrl.searchParams.get('session_id')?.trim();

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('clip_id, status')
    .eq('stripe_checkout_session_id', sessionId)
    .eq('clip_id', clipId)
    .eq('status', 'paid')
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json(
      { error: 'No paid order found for this clip and session.' },
      { status: 404 }
    );
  }

  const { data: clip, error: clipError } = await supabaseAdmin
    .from('clips')
    .select('id, s3_key')
    .eq('id', clipId)
    .single();

  if (clipError || !clip || !clip.s3_key) {
    return NextResponse.json(
      { error: 'Clip file not found.' },
      { status: 404 }
    );
  }

  try {
    const signedUrl = await createSignedDownloadUrl(clip.s3_key);
    return NextResponse.redirect(signedUrl, 302);
  } catch (error) {
    console.error('download route error:', error);
    return NextResponse.json(
      { error: 'Failed to generate download URL.' },
      { status: 500 }
    );
  }
}