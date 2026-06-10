import { NextRequest } from 'next/server';
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { s3 } from '@/lib/s3';
import { verifyPbVisionSourceFileName } from '@/lib/pb-vision-source-url';

export const maxDuration = 300;

const bucket = process.env.AWS_S3_BUCKET!;

function parseByteRange(
  rangeHeader: string | null,
  size: number
): { start: number; end: number } | null {
  if (!rangeHeader?.startsWith('bytes=')) {
    return null;
  }

  const [startStr, endStr] = rangeHeader.slice('bytes='.length).split('-');
  const start = Number.parseInt(startStr, 10);
  if (Number.isNaN(start) || start < 0 || start >= size) {
    return null;
  }

  const end = endStr ? Number.parseInt(endStr, 10) : size - 1;
  if (Number.isNaN(end) || end < start) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}

function bodyToWebStream(body: unknown): ReadableStream {
  if (body instanceof Readable) {
    return Readable.toWeb(body) as ReadableStream;
  }

  throw new Error('S3 object body is not a readable stream');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ fileName: string }> }
) {
  const { fileName } = await context.params;
  const verified = verifyPbVisionSourceFileName(fileName);

  if (!verified) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: verified.s3Key,
      })
    );
    const totalSize = head.ContentLength;
    if (totalSize == null || totalSize <= 0) {
      return new Response('Video unavailable', { status: 404 });
    }

    const byteRange = parseByteRange(request.headers.get('range'), totalSize);

    if (byteRange) {
      const { start, end } = byteRange;
      const response = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: verified.s3Key,
          Range: `bytes=${start}-${end}`,
        })
      );

      if (!response.Body) {
        return new Response('Video unavailable', { status: 404 });
      }

      const contentLength = end - start + 1;
      return new Response(bodyToWebStream(response.Body), {
        status: 206,
        headers: {
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Content-Length': String(contentLength),
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: verified.s3Key,
      })
    );

    if (!response.Body) {
      return new Response('Video unavailable', { status: 404 });
    }

    return new Response(bodyToWebStream(response.Body), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Length': String(totalSize),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[PB Vision Source] Stream failed', {
      s3_key: verified.s3Key,
      error: error instanceof Error ? error.message : error,
    });
    return new Response('Video unavailable', { status: 500 });
  }
}
