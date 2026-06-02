import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSignedDownloadUrl } from '@/lib/s3';

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeFilename(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email')?.trim().toLowerCase();
    const clipId = searchParams.get('clip_id')?.trim();

    if (!email) {
      console.warn('[PlayerTrove Download] Missing email parameter');
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!clipId || !uuidRegex.test(clipId)) {
      console.warn('[PlayerTrove Download] Invalid or missing clip_id', { clipId });
      return NextResponse.json(
        { error: 'Invalid clip_id' },
        { status: 400 }
      );
    }

    console.log('[PlayerTrove Download] Download requested', {
      email,
      clip_id: clipId,
      timestamp: new Date().toISOString(),
    });

    // =========================================================================
    // Verify player_video_access record exists and is active
    // =========================================================================
    const { data: accessRecord, error: accessError } = await supabaseAdmin
      .from('player_video_access')
      .select('id, email, clip_id, downloaded_at, download_expires_at, purchased_s3_key')
      .eq('email', email)
      .eq('clip_id', clipId)
      .eq('access_status', 'active')
      .single();

    if (accessError || !accessRecord) {
      console.warn('[PlayerTrove Download] No active access record found', {
        email,
        clip_id: clipId,
        error: accessError,
      });
      return NextResponse.json(
        { error: 'You do not have access to this clip' },
        { status: 403 }
      );
    }

    // =========================================================================
    // Check if download_expires_at has passed
    // =========================================================================
    const now = new Date();
    if (accessRecord.download_expires_at) {
      const expiresAt = new Date(accessRecord.download_expires_at);
      if (now > expiresAt) {
        console.warn('[PlayerTrove Download] Download access expired', {
          email,
          clip_id: clipId,
          download_expires_at: accessRecord.download_expires_at,
        });
        return NextResponse.json(
          { error: 'Your download access has expired for this clip' },
          { status: 403 }
        );
      }
    }

    // =========================================================================
    // Use purchased_s3_key if available, fallback to clip.s3_key
    // =========================================================================
    let s3Key: string | null = accessRecord.purchased_s3_key;

    if (!s3Key) {
      console.log('[PlayerTrove Download] No purchased_s3_key found, fetching from clips table', {
        clip_id: clipId,
      });

      const { data: clip, error: clipError } = await supabaseAdmin
        .from('clips')
        .select('id, title, s3_key')
        .eq('id', clipId)
        .single();

      if (clipError || !clip) {
        console.error('[PlayerTrove Download] Clip not found', { clipId, clipError });
        return NextResponse.json(
          { error: 'Clip not found' },
          { status: 404 }
        );
      }

      s3Key = clip.s3_key;

      if (!s3Key) {
        console.error('[PlayerTrove Download] No s3_key found on clip', { clipId });
        return NextResponse.json(
          { error: 'Clip file not available' },
          { status: 400 }
        );
      }
    }

    // =========================================================================
    // Generate signed download URL
    // =========================================================================
    const { data: clip, error: clipError } = await supabaseAdmin
      .from('clips')
      .select('id, title')
      .eq('id', clipId)
      .single();

    const filenameBase = safeFilename(clip?.title || 'clip');
    const signedUrl = await createSignedDownloadUrl(
      s3Key,
      `${filenameBase}.mp4`
    );

    console.log('[PlayerTrove Download] Signed URL generated', {
      email,
      clip_id: clipId,
      using_purchased_key: !!accessRecord.purchased_s3_key,
      timestamp: new Date().toISOString(),
    });

    // =========================================================================
    // Update downloaded_at timestamp (optional tracking)
    // =========================================================================
    try {
      await supabaseAdmin
        .from('player_video_access')
        .update({ downloaded_at: now.toISOString() })
        .eq('id', accessRecord.id);
    } catch (updateError) {
      console.warn('[PlayerTrove Download] Failed to update downloaded_at', {
        access_id: accessRecord.id,
        error: updateError,
      });
      // Don't fail the download if we can't update the timestamp
    }

    return NextResponse.redirect(signedUrl, 302);
  } catch (error) {
    console.error('[PlayerTrove Download] Route error:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Something went wrong',
      },
      { status: 500 }
    );
  }
}
