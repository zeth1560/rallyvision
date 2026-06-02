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
    const accessId = searchParams.get('access_id')?.trim();

    if (!accessId || !uuidRegex.test(accessId)) {
      console.warn('[PlayerTrove Download] Invalid or missing access_id', { access_id: accessId });
      return NextResponse.json(
        { error: 'Invalid access_id' },
        { status: 400 }
      );
    }

    console.log('[PlayerTrove Download] Download requested', {
      access_id: accessId,
      timestamp: new Date().toISOString(),
    });

    // =========================================================================
    // Verify player_video_access record exists and is active
    // =========================================================================
    const { data: accessRecord, error: accessError } = await supabaseAdmin
      .from('player_video_access')
      .select('id, clip_id, downloaded_at, download_expires_at, purchased_s3_key, access_status')
      .eq('id', accessId)
      .eq('access_status', 'active')
      .single();

    if (accessError || !accessRecord) {
      const { data: accessDiagnostic } = await supabaseAdmin
        .from('player_video_access')
        .select('id, access_status')
        .eq('id', accessId)
        .maybeSingle();

      console.warn('[PlayerTrove Download] Access check failed', {
        access_id: accessId,
        active_access_error: accessError?.message,
        access_record_found: !!accessDiagnostic,
        access_status: accessDiagnostic?.access_status ?? 'none',
      });

      if (accessDiagnostic?.id) {
        return NextResponse.json(
          { error: 'You do not have access to this clip' },
          { status: 403 }
        );
      }

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
          access_id: accessId,
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
    let usedPurchasedKey = true;
    let clipTitle: string | null = null;

    if (!s3Key) {
      const { data: clip, error: clipError } = await supabaseAdmin
        .from('clips')
        .select('title, s3_key')
        .eq('id', accessRecord.clip_id)
        .single();

      if (clipError || !clip) {
        console.error('[PlayerTrove Download] Clip lookup failed for fallback key', {
          access_id: accessId,
          clip_id: accessRecord.clip_id,
          error: clipError,
        });
        return NextResponse.json(
          { error: 'Clip not found' },
          { status: 404 }
        );
      }

      s3Key = clip.s3_key;
      clipTitle = clip.title;
      usedPurchasedKey = false;

      console.log('[PlayerTrove Download] Falling back to clip.s3_key', {
        access_id: accessId,
        clip_id: accessRecord.clip_id,
        s3_key: s3Key,
      });
    } else {
      console.log('[PlayerTrove Download] Using purchased_s3_key', {
        access_id: accessId,
        s3_key: s3Key,
      });
    }

    if (!s3Key) {
      console.error('[PlayerTrove Download] No downloadable key available after fallback', {
        access_id: accessId,
      });
      return NextResponse.json(
        { error: 'No downloadable file is available for this access record' },
        { status: 400 }
      );
    }

    // =========================================================================
    // Generate signed download URL
    // =========================================================================
    const filenameBase = safeFilename(clipTitle || accessRecord.clip_id);
    const signedUrl = await createSignedDownloadUrl(
      s3Key,
      `${filenameBase}.mp4`
    );

    console.log('[PlayerTrove Download] Signed URL generated', {
      access_id: accessId,
      used_purchased_key: usedPurchasedKey,
      s3_key: s3Key,
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

    return NextResponse.json({ url: signedUrl });
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
