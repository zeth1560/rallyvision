import { NextRequest, NextResponse } from 'next/server';
import { UUID_REGEX } from '@/lib/hd-download';
import { startPlayerTroveProReviewRequest } from '@/lib/pro-review-request';
import {
  readPlayerTroveTokenFromRequest,
  verifyPlayerTroveRequestToken,
} from '@/lib/player-trove-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const accessId = body?.access_id?.trim();

    if (!accessId || !UUID_REGEX.test(accessId)) {
      return NextResponse.json({ error: 'Invalid access_id' }, { status: 400 });
    }

    const token = readPlayerTroveTokenFromRequest(request, body?.token);
    const verified = verifyPlayerTroveRequestToken(token);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: verified.status });
    }

    const result = await startPlayerTroveProReviewRequest({
      accessId,
      viewerEmail: verified.email,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      request_id: result.request_id,
      status: result.status,
      identification_frame_url: result.identification_frame_url,
      identification_frame_s3_key: result.identification_frame_s3_key,
      identification_frame_timestamp_seconds:
        result.identification_frame_timestamp_seconds,
      frame_id: result.frame_id,
    });
  } catch (error) {
    console.error('[Pro Review Start] Route error:', error);
    return NextResponse.json(
      { error: 'Failed to start Pro Review request' },
      { status: 500 }
    );
  }
}
