import { NextRequest, NextResponse } from 'next/server';
import { fetchPlayerTroveVideosForEmail } from '@/lib/player-trove-videos';
import { autoSubmitPendingPbVisionPurchases } from '@/lib/pb-vision-request';
import {
  PLAYER_TROVE_TOKEN_COOKIE,
  resolvePlayerTroveViewerEmail,
} from '@/lib/player-trove-auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cookieToken = request.cookies.get(PLAYER_TROVE_TOKEN_COOKIE)?.value;
  const auth = resolvePlayerTroveViewerEmail(searchParams, cookieToken);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  console.log('[PlayerTrove] Video access requested', {
    auth_method: auth.auth,
    timestamp: new Date().toISOString(),
  });

  try {
    let result = await fetchPlayerTroveVideosForEmail(auth.email);

    await autoSubmitPendingPbVisionPurchases({
      email: auth.email,
      videos: result.videos,
    });

    result = await fetchPlayerTroveVideosForEmail(auth.email);

    console.log('[PlayerTrove] Videos fetched successfully', {
      auth_method: auth.auth,
      video_count: result.videos.length,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[PlayerTrove] Failed to fetch access records', {
      auth_method: auth.auth,
      error: error instanceof Error ? error.message : error,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      { error: 'Failed to fetch access records' },
      { status: 500 }
    );
  }
}
