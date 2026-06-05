import { NextResponse } from 'next/server';
import { createSignedDownloadUrl } from '@/lib/s3';
import {
  UUID_REGEX,
  logHdDownload,
  markAccessDownloaded,
  resolveHdDownloadByPaidOrder,
} from '@/lib/hd-download';

const ROUTE = '/api/download';

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

    if (!UUID_REGEX.test(clipId)) {
      return NextResponse.json(
        { error: 'Invalid clip_id' },
        { status: 400 }
      );
    }

    if (sessionId.startsWith('free_')) {
      console.error('[SECURITY] Attempt to download free clip via paid orders flow', {
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
    console.error('[HD Download] /api/download route error:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Something went wrong',
      },
      { status: 500 }
    );
  }
}
