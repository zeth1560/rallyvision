import {
  S3Client,
  GetObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

const bucket = process.env.AWS_S3_BUCKET!;

export const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function createSignedDownloadUrl(
  key: string,
  filename?: string
) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,

    // 👇 THIS is the magic
    ResponseContentDisposition: filename
      ? `attachment; filename="${filename}"`
      : 'attachment',

    // Optional but helps consistency
    ResponseContentType: 'video/mp4',
  });

  return await getSignedUrl(s3, command, {
    expiresIn: 60,
  });
}

export async function createSignedPreviewUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,

    // For previews, use inline disposition to allow browser playback
    ResponseContentDisposition: 'inline',

    // Keep video/mp4 content type
    ResponseContentType: 'video/mp4',
  });

  return await getSignedUrl(s3, command, {
    expiresIn: 3600, // 1 hour for previews to handle range requests
  });
}

/** Long-lived signed URL for external services (e.g. PB Vision) to fetch an MP4. */
export async function createSignedMp4FetchUrl(
  key: string,
  expiresInSeconds = 6 * 60 * 60
) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: 'inline',
    ResponseContentType: 'video/mp4',
  });

  return await getSignedUrl(s3, command, {
    expiresIn: expiresInSeconds,
  });
}

export async function createSignedObjectUrl(
  key: string,
  contentType?: string
) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: 'inline',
    ...(contentType ? { ResponseContentType: contentType } : {}),
  });

  return await getSignedUrl(s3, command, {
    expiresIn: 3600,
  });
}

function encodeS3CopySource(sourceKey: string) {
  return [bucket, ...sourceKey.split('/')].map(encodeURIComponent).join('/');
}

/** PB Vision accepts up to 2GB; keep under serverless memory/time limits. */
export const MAX_PBV_DIRECT_UPLOAD_BYTES = 800 * 1024 * 1024;

/** Max size served through the PB Vision proxy URL fallback on our origin. */
export const MAX_PBV_PROXY_BYTES = MAX_PBV_DIRECT_UPLOAD_BYTES;

export async function ensureS3ObjectHasVideoMp4ContentType(key: string): Promise<void> {
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  if (head.ContentType?.toLowerCase() === 'video/mp4') {
    return;
  }

  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: key,
      CopySource: encodeS3CopySource(key),
      ContentType: 'video/mp4',
      MetadataDirective: 'REPLACE',
      ...(head.Metadata && Object.keys(head.Metadata).length > 0
        ? { Metadata: head.Metadata }
        : {}),
    })
  );
}

export async function getS3ObjectContentLength(key: string): Promise<number | null> {
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return head.ContentLength ?? null;
}

export async function downloadS3ObjectToTempFile(key: string): Promise<{
  filePath: string;
  cleanup: () => Promise<void>;
}> {
  const contentLength = await getS3ObjectContentLength(key);
  if (contentLength != null && contentLength > MAX_PBV_DIRECT_UPLOAD_BYTES) {
    throw new Error(
      `Video file is too large for PB Vision direct upload (${contentLength} bytes; max ${MAX_PBV_DIRECT_UPLOAD_BYTES})`
    );
  }

  const dir = await mkdtemp(join(tmpdir(), 'pbv-upload-'));
  const basename = key.split('/').pop() || 'video.mp4';
  const filename = basename.toLowerCase().endsWith('.mp4') ? basename : `${basename}.mp4`;
  const filePath = join(dir, filename);

  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) {
    await rm(dir, { recursive: true, force: true });
    throw new Error('S3 object has no body');
  }

  try {
    await pipeline(response.Body as Readable, createWriteStream(filePath));
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }

  return {
    filePath,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function copyObjectWithinBucket(
  sourceKey: string,
  destinationKey: string
) {
  const command = new CopyObjectCommand({
    Bucket: bucket,
    CopySource: encodeS3CopySource(sourceKey),
    Key: destinationKey,
  });

  return await s3.send(command);
}