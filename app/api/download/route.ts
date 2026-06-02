import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSignedDownloadUrl } from '@/lib/s3';

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeFilename(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clipId = searchParams.get('clip_id')?.trim();
    const sessionId = searchParams.get('session_id')?.trim();

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

    // =========================================================================
    // SECURITY: Reject free order bypass attempts
    // =========================================================================
    if (sessionId.startsWith('free_')) {
      console.error('[SECURITY] Attempt to download free clip via paid orders flow', {
        clip_id: clipId,
        session_id: sessionId,
        timestamp: new Date().toISOString(),
        note: 'Free clips must be downloaded via PlayerTrove after claiming with email',
      });

      return NextResponse.json(
        { error: 'Free clips cannot be downloaded directly. Please claim access and download from your PlayerTrove.' },
        { status: 403 }
      );
    }

    const { data: order, error: orderError } = await supabaseAdmin
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

    const { data: clip, error: clipError } = await supabaseAdmin
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

    const filenameBase = safeFilename(clip.title || 'clip');
    const signedUrl = await createSignedDownloadUrl(
      clip.s3_key,
      `${filenameBase}.mp4`
    );

    return NextResponse.redirect(signedUrl, 302);
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