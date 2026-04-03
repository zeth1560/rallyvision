import { NextRequest, NextResponse } from 'next/server';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { s3 } from '@/lib/s3';

export const runtime = 'nodejs';

const bucket = process.env.AWS_S3_BUCKET!;

type ClipRow = {
  id: string;
  title: string | null;
  slug: string | null;
  s3_key: string | null;
};

function safeFilename(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('session_id')?.trim();

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
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

    const { data: clipsData, error: clipsError } = await supabaseAdmin
      .from('clips')
      .select('id, title, slug, s3_key')
      .in('id', clipIds);

    if (clipsError) {
      return NextResponse.json({ error: clipsError.message }, { status: 500 });
    }

    const clips = (clipsData ?? []).filter(
      (clip): clip is ClipRow => Boolean(clip?.s3_key)
    );

    if (clips.length === 0) {
      return NextResponse.json(
        { error: 'No downloadable clips were found.' },
        { status: 404 }
      );
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = new PassThrough();

    archive.on('error', (err: Error) => {
  stream.destroy(err);
});

    archive.pipe(stream);

    for (const clip of clips) {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: clip.s3_key!,
      });

      const s3Object = await s3.send(command);
      const body = s3Object.Body;

      if (!body || typeof (body as any).pipe !== 'function') {
        continue;
      }

      const filenameBase = safeFilename(
        clip.title || clip.slug || clip.id || 'clip'
      );

      archive.append(body as NodeJS.ReadableStream, {
        name: `${filenameBase}.mp4`,
      });
    }

    const archiveDone = new Promise<void>((resolve, reject) => {
      stream.on('end', () => resolve());
      stream.on('error', reject);
      archive.on('error', reject);
    });

    archive.finalize();

    return new NextResponse(stream as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="replaytrove-clips-${sessionId}.zip"`,
      },
    });
  } catch (error) {
    console.error('download-all route error:', error);

    return NextResponse.json(
      { error: 'Failed to build zip download.' },
      { status: 500 }
    );
  }
}