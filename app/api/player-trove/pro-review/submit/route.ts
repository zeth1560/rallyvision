import { NextRequest, NextResponse } from 'next/server';
import { UUID_REGEX } from '@/lib/hd-download';
import { submitPlayerTroveProReviewRequest } from '@/lib/pro-review-request';
import {
  readPlayerTroveTokenFromRequest,
  verifyPlayerTroveRequestToken,
} from '@/lib/player-trove-auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requestId = body?.request_id?.trim();

    if (!requestId || !UUID_REGEX.test(requestId)) {
      return NextResponse.json({ error: 'Invalid request_id' }, { status: 400 });
    }

    const token = readPlayerTroveTokenFromRequest(request, body?.token);
    const verified = verifyPlayerTroveRequestToken(token);
    if (!verified.ok) {
      return NextResponse.json({ error: verified.error }, { status: verified.status });
    }

    const buyerPosition =
      typeof body?.buyer_position === 'string' ? body.buyer_position.trim() : '';

    if (!buyerPosition) {
      return NextResponse.json({ error: 'buyer_position is required' }, { status: 400 });
    }

    const result = await submitPlayerTroveProReviewRequest({
      requestId,
      viewerEmail: verified.email,
      focusNotes: typeof body?.focus_notes === 'string' ? body.focus_notes : undefined,
      skillLevel: typeof body?.skill_level === 'string' ? body.skill_level : undefined,
      specificMomentNotes:
        typeof body?.specific_moment_notes === 'string'
          ? body.specific_moment_notes
          : undefined,
      additionalNotes:
        typeof body?.additional_notes === 'string' ? body.additional_notes : undefined,
      buyerPosition,
      playerNames: body?.player_names,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      request_id: result.request_id,
      status: result.status,
    });
  } catch (error) {
    console.error('[Pro Review Submit] Route error:', error);
    return NextResponse.json(
      { error: 'Failed to submit Pro Review request' },
      { status: 500 }
    );
  }
}
