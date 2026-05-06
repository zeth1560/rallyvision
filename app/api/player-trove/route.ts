import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');

  if (!email) {
    return NextResponse.json(
      { error: 'Email parameter required' },
      { status: 400 }
    );
  }

  // TODO: Remove this route or add proper authentication before production
  // This is temporary for development only
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This endpoint is not available in production' },
      { status: 403 }
    );
  }

  const normalizedEmail = email.toLowerCase().trim();

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
    console.error('Failed to fetch player video access:', error);
    return NextResponse.json(
      { error: 'Failed to fetch access records' },
      { status: 500 }
    );
  }

  // Transform the data
  const videos = accessRecords?.map(record => ({
    clip_id: record.clip_id,
    clip_slug: (record.clips as any)?.slug,
    recorded_at: (record.clips as any)?.recorded_at,
    booking_id: (record.clips as any)?.booking_id,
    thumbnail_s3_key: record.thumbnail_s3_key,
    youtube_url: record.youtube_url,
    youtube_status: record.youtube_status,
    download_expires_at: record.download_expires_at,
    pb_vision_expires_at: record.pb_vision_expires_at,
    coach_review_expires_at: record.coach_review_expires_at,
    purchased_at: record.purchased_at,
  })) || [];

  return NextResponse.json({
    email: normalizedEmail,
    videos,
  });
}