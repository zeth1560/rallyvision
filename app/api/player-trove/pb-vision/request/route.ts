import { NextRequest, NextResponse } from 'next/server';
import { UUID_REGEX } from '@/lib/hd-download';
import { submitPlayerTrovePbVisionRequest } from '@/lib/pb-vision-request';
import { resolveHdDownloadByAccessId } from '@/lib/hd-download';
import {
  readPlayerTroveTokenFromRequest,
  verifyPlayerTroveRequestToken,
} from '@/lib/player-trove-auth';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const accessId = body?.access_id?.trim();
    const notes = typeof body?.notes === 'string' ? body.notes : undefined;

    if (!accessId || !UUID_REGEX.test(accessId)) {
      return NextResponse.json({ error: 'Invalid access_id' }, { status: 400 });
    }

    const token = readPlayerTroveTokenFromRequest(request, body?.token);

    const verified = verifyPlayerTroveRequestToken(token);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: verified.status });
    }

    const result = await submitPlayerTrovePbVisionRequest({
      accessId,
      viewerEmail: verified.email,
      notes,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      request_id: result.request_id,
      status: result.status,
      pbv_vid: result.pbv_vid,
      pbv_webpage_url: result.pbv_webpage_url,
    });
  } catch (error) {
    console.error('[PB Vision Request] Route error:', error);
    return NextResponse.json(
      { error: 'Failed to submit PB Vision request' },
      { status: 500 }
    );
  }
}
