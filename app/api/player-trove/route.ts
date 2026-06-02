import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSignedObjectUrl } from '@/lib/s3';

function getThumbnailContentType(key: string) {
  const lower = key.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  if (!email) {
    return NextResponse.json(
      { error: 'Email parameter required' },
      { status: 400 }
    );
  }



  // TODO: SECURITY - Before full public launch, implement magic-link authentication
  // instead of using email query param. This temporary implementation allows free checkout
  // to work end-to-end but should be replaced with:
  // 1. User requests magic link with POST /api/player-trove/request-link
  // 2. Email sent with signed JWT token
  // 3. Link redirects to /player-trove?token={jwt}
  // 4. Validate JWT server-side and create secure session
  // 5. Use session/cookie-based auth instead of email param
  // GitHub issue: https://github.com/zeth1560/rallyvision/issues/XXX

  const normalizedEmail = email.toLowerCase().trim();

  console.log('[PlayerTrove] Video access requested', {
    email: normalizedEmail,
    timestamp: new Date().toISOString(),
  });

  const { data: accessRecords, error } = await supabaseAdmin
    .from('player_video_access')
    .select(`
      clip_id,
      purchased_at,
      download_expires_at,
      pb_vision_expires_at,
      coach_review_expires_at,
      thumbnail_s3_key,
      youtube_url,
      youtube_status,
      clips (
        id,
        slug,
        recorded_at,
        booking_id
      )
    `)
    .eq('email', normalizedEmail)
    .eq('access_status', 'active')
    .order('purchased_at', { ascending: false });

  if (error) {
    console.error('[PlayerTrove] Failed to fetch access records', {
      email: normalizedEmail,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      { error: 'Failed to fetch access records' },
      { status: 500 }
    );
  }

  // Transform the data
  const videos = await Promise.all(
    (accessRecords ?? []).map(async (record) => ({
      clip_id: record.clip_id,
      clip_slug: (record.clips as any)?.slug,
      recorded_at: (record.clips as any)?.recorded_at,
      booking_id: (record.clips as any)?.booking_id,
      thumbnail_url: record.thumbnail_s3_key
        ? await createSignedObjectUrl(
            record.thumbnail_s3_key,
            getThumbnailContentType(record.thumbnail_s3_key)
          )
        : null,
      youtube_url: record.youtube_url,
      youtube_status: record.youtube_status,
      download_expires_at: record.download_expires_at,
      pb_vision_expires_at: record.pb_vision_expires_at,
      coach_review_expires_at: record.coach_review_expires_at,
      purchased_at: record.purchased_at,
    }))
  );

  console.log('[PlayerTrove] Videos fetched successfully', {
    email: normalizedEmail,
    video_count: videos.length,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    email: normalizedEmail,
    videos,
  });
}