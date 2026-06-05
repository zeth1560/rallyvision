import { NextRequest, NextResponse } from 'next/server';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { s3 } from '@/lib/s3';
import { logHdDownload, resolveHdDownloadByPaidOrder } from '@/lib/hd-download';

export const runtime = 'nodejs';

const ROUTE = '/api/download-all';
const bucket = process.env.AWS_S3_BUCKET!;

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id')?.trim();

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    if (sessionId.startsWith('free_')) {
      console.error('[SECURITY] Attempt to download free clips via paid orders flow (download-all)', {
        route: ROUTE,
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

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('clip_id, status')
      .eq('stripe_checkout_session_id', sessionId)
      .eq('status', 'paid');

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json(
        { error: 'No paid clips found for this session.' },
        { status: 404 }
      );
    }

    const clipIds = [...new Set(orders.map((order) => order.clip_id))];

    logHdDownload(ROUTE, {
      session_id: sessionId,
      clip_ids: clipIds,
      phase: 'start',
    });

    const resolvedDownloads = [];
    const skippedClips: Array<{ clip_id: string; reason: string }> = [];

    for (const clipId of clipIds) {
      const resolved = await resolveHdDownloadByPaidOrder({
        clipId,
        stripeCheckoutSessionId: sessionId,
        route: ROUTE,
      });

      if (!resolved.ok) {
        skippedClips.push({ clip_id: clipId, reason: resolved.error });
        logHdDownload(ROUTE, {
          session_id: sessionId,
          clip_id: clipId,
          phase: 'clip_skipped',
          reason: resolved.error,
        });
        continue;
      }

      resolvedDownloads.push(resolved.download);
    }

    if (resolvedDownloads.length === 0) {
      logHdDownload(ROUTE, {
        session_id: sessionId,
        phase: 'no_downloadable_clips',
        skipped_clips: skippedClips,
      });

      return NextResponse.json(
        {
          error: 'No downloadable clips were found for this session.',
          skipped_clips: skippedClips,
        },
        { status: 404 }
      );
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = new PassThrough();

    archive.on('error', (err: Error) => {
      stream.destroy(err);
    });

    archive.pipe(stream);

    for (const download of resolvedDownloads) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: download.s3Key,
      });

      const s3Object = await s3.send(command);
      const body = s3Object.Body;

      if (!body || typeof (body as NodeJS.ReadableStream & { pipe?: unknown }).pipe !== 'function') {
        skippedClips.push({
          clip_id: download.clipId,
          reason: 'S3 object body unavailable',
        });
        continue;
      }

      archive.append(body as NodeJS.ReadableStream, {
        name: download.filename,
      });

      logHdDownload(ROUTE, {
        session_id: sessionId,
        clip_id: download.clipId,
        access_id: download.accessId,
        key_source: download.keySource,
        s3_key: download.s3Key,
        phase: 'archived',
      });
    }

    archive.finalize();

    logHdDownload(ROUTE, {
      session_id: sessionId,
      phase: 'zip_ready',
      clip_count: resolvedDownloads.length,
      skipped_clips: skippedClips,
    });

    return new NextResponse(stream as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="replaytrove-clips-${sessionId}.zip"`,
      },
    });
  } catch (error) {
    console.error('[HD Download] /api/download-all route error:', error);

    return NextResponse.json(
      { error: 'Failed to build zip download.' },
      { status: 500 }
    );
  }
}
