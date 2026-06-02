import { S3Client, GetObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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