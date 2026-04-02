import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export const runtime = 'nodejs';

const stripeSessionRegex = /^cs_(test|live)_[A-Za-z0-9]+$/;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

function safeFilename(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'clip';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing session_id' },
        { status: 400 }
      );
    }

    if (!stripeSessionRegex.test(sessionId)) {
      return NextResponse.json(
        { error: 'Invalid session_id' },
        { status: 400 }
      );
    }

    const bucketName = process.env.AWS_S3_BUCKET;

    if (!bucketName) {
      return NextResponse.json(
        { error: 'Missing AWS_S3_BUCKET in environment variables' },
        { status: 500 }
      );
    }

    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('clip_id')
      .eq('stripe_checkout_session_id', sessionId)
      .eq('status', 'paid');

    if (ordersError || !orders || orders.length === 0) {
      return NextResponse.json(
        { error: 'No purchased clips found' },
        { status: 404 }
      );
    }

    const clipIds = orders
      .map((order) => order.clip_id)
      .filter(
        (clipId): clipId is string =>
          typeof clipId === 'string' && clipId.trim().length > 0
      );

    if (clipIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid purchased clip IDs found' },
        { status: 404 }
      );
    }

    const { data: clips, error: clipsError } = await supabaseAdmin
      .from('clips')
      .select('id, title, slug, s3_key')
      .in('id', clipIds);

    if (clipsError || !clips || clips.length === 0) {
      return NextResponse.json(
        { error: 'Clips not found' },
        { status: 404 }
      );
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const nodeStream = new PassThrough();

    archive.on('error', (err: unknown) => {
      console.error('Archiver error:', err);

      if (err instanceof Error) {
        nodeStream.destroy(err);
      } else {
        nodeStream.destroy(new Error('Unknown archiver error'));
      }
    });

    archive.pipe(nodeStream);

    const response = new Response(nodeStream as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="rallyvision-clips.zip"',
      },
    });

    (async () => {
      try {
        for (const clip of clips) {
          console.log('Preparing ZIP clip:', {
            id: clip.id,
            title: clip.title,
            slug: clip.slug,
            s3_key: clip.s3_key,
          });

          if (!clip.s3_key) {
            throw new Error(`Clip ${clip.id} is missing s3_key`);
          }

          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: clip.s3_key,
          });

          const s3Response = await s3.send(command);
          const bodyStream = s3Response.Body as NodeJS.ReadableStream;

          archive.append(bodyStream, {
            name: `${safeFilename(clip.title || clip.slug || 'clip')}.mp4`,
          });
        }

        await archive.finalize();
        console.log('ZIP archive finalized for session:', sessionId);
      } catch (error) {
        console.error('ZIP build error:', error);
        archive.destroy();
        nodeStream.destroy(
          error instanceof Error ? error : new Error('ZIP build failed')
        );
      }
    })();

    return response;
  } catch (error) {
    console.error('ZIP route error:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'ZIP failed',
      },
      { status: 500 }
    );
  }
}