const { S3Client, CopyObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: '.env.local' });

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function run() {
  const bucket = process.env.AWS_S3_BUCKET;

  const sourceKey = 'rally-vision/InstantReplay.mp4';
  const destinationKey = 'rally-vision/InstantReplay_002.mp4';

  const command = new CopyObjectCommand({
    Bucket: bucket,
    CopySource: `${bucket}/${sourceKey}`,
    Key: destinationKey,
  });

  await s3.send(command);
  console.log(`Copied ${sourceKey} -> ${destinationKey}`);
}

run().catch(console.error);