import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
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