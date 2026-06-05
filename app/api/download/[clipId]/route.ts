import { NextRequest, NextResponse } from 'next/server';
import { createSignedDownloadUrl } from '@/lib/s3';
import {
  logHdDownload,
  markAccessDownloaded,
  resolveHdDownloadByPaidOrder,
} from '@/lib/hd-download';

const ROUTE = '/api/download/[clipId]';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> }
) {
  const { clipId } = await params;
  const sessionId = request.nextUrl.searchParams.get('session_id')?.trim();

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
  }

  if (sessionId.startsWith('free_')) {
    console.error('[SECURITY] Attempt to download free clip via paid orders flow [clipId]', {
      route: ROUTE,
      clip_id: clipId,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        error:
          'Free clips cannot be downloaded directly. Please claim access and download from your PlayerTrove.',
      },
      { status: 403 }
    );
  }

  try {
    const resolved = await resolveHdDownloadByPaidOrder({
      clipId,
      stripeCheckoutSessionId: sessionId,
      route: ROUTE,
    });

    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.error },
        { status: resolved.status }
      );
    }

    const { download } = resolved;

    let signedUrl: string;
    try {
      signedUrl = await createSignedDownloadUrl(download.s3Key, download.filename);
    } catch (signError) {
      logHdDownload(ROUTE, {
        clip_id: clipId,
        session_id: sessionId,
        access_id: download.accessId,
        key_source: download.keySource,
        phase: 'signed_url_failed',
        error: signError instanceof Error ? signError.message : signError,
      });
      throw signError;
    }

    logHdDownload(ROUTE, {
      clip_id: clipId,
      session_id: sessionId,
      access_id: download.accessId,
      key_source: download.keySource,
      s3_key: download.s3Key,
      phase: 'signed_url_success',
    });

    await markAccessDownloaded(download.accessId);

    return NextResponse.redirect(signedUrl, 302);
  } catch (error) {
    console.error('[HD Download] /api/download/[clipId] route error:', error);
    return NextResponse.json(
      { error: 'Failed to generate download URL.' },
      { status: 500 }
    );
  }
}
