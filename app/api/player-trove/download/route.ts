import { NextRequest, NextResponse } from 'next/server';
import { createSignedDownloadUrl } from '@/lib/s3';
import {
  UUID_REGEX,
  logHdDownload,
  markAccessDownloaded,
  resolveHdDownloadByAccessId,
} from '@/lib/hd-download';
import { resolvePlayerTroveViewerEmail, PLAYER_TROVE_TOKEN_COOKIE } from '@/lib/player-trove-auth';

const ROUTE = '/api/player-trove/download';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accessId = searchParams.get('access_id')?.trim();

    if (!accessId || !UUID_REGEX.test(accessId)) {
      return NextResponse.json({ error: 'Invalid access_id' }, { status: 400 });
    }

    const cookieToken = request.cookies.get(PLAYER_TROVE_TOKEN_COOKIE)?.value;
    const auth = resolvePlayerTroveViewerEmail(searchParams, cookieToken);

    if (!auth.ok) {
      logHdDownload(ROUTE, {
        access_id: accessId,
        phase: 'auth_failed',
        status: auth.status,
      });
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    logHdDownload(ROUTE, {
      access_id: accessId,
      auth_method: auth.auth,
      phase: 'auth_ok',
    });

    const resolved = await resolveHdDownloadByAccessId(
      accessId,
      ROUTE,
      auth.email
    );

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
        access_id: accessId,
        clip_id: download.clipId,
        auth_method: auth.auth,
        key_source: download.keySource,
        phase: 'signed_url_failed',
        error: signError instanceof Error ? signError.message : signError,
      });
      throw signError;
    }

    logHdDownload(ROUTE, {
      access_id: accessId,
      clip_id: download.clipId,
      auth_method: auth.auth,
      key_source: download.keySource,
      s3_key: download.s3Key,
      phase: 'signed_url_success',
    });

    await markAccessDownloaded(download.accessId);

    const redirect = searchParams.get('redirect') === '1';
    if (redirect) {
      return NextResponse.redirect(signedUrl);
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
