import { createReadStream, statSync } from 'node:fs';
import { PBVision } from '@pbvision/partner-sdk';
import {
  createSignedMp4FetchUrl,
  downloadS3ObjectToTempFile,
} from '@/lib/s3';

export type PBVisionSubmitMetadata = {
  userEmails: string[];
  name?: string;
  desc?: string;
  gameStartEpoch?: number;
  facility?: string;
  court?: string;
  /** Duration in seconds; required for direct upload / make_video_id billing. */
  videoSecs?: number;
};

let pbvClient: PBVision | null = null;

function getPbVisionApiKeyParts() {
  const apiKey = process.env.PBVISION_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('PBVISION_API_KEY is not configured');
  }

  const underscoreIndex = apiKey.lastIndexOf('_');
  if (underscoreIndex === -1) {
    throw new Error('Invalid PBVISION_API_KEY format');
  }

  return {
    apiKey,
    uid: apiKey.substring(0, underscoreIndex),
    useProdServer: process.env.PBVISION_USE_PROD_SERVER === 'true',
  };
}

function getPbVisionServer(useProdServer: boolean) {
  return useProdServer
    ? 'https://api-2o2klzx4pa-uc.a.run.app'
    : 'https://api-ko3kowqi6a-uc.a.run.app';
}

function getPBVisionClient(): PBVision {
  const { apiKey, useProdServer } = getPbVisionApiKeyParts();

  if (!pbvClient) {
    pbvClient = new PBVision(apiKey, { useProdServer });
  }

  return pbvClient;
}

function toPbvMetadata(metadata: PBVisionSubmitMetadata) {
  return {
    userEmails: metadata.userEmails,
    name: metadata.name,
    desc: metadata.desc,
    gameStartEpoch: metadata.gameStartEpoch,
    facility: metadata.facility,
    court: metadata.court,
  };
}

async function callPBVisionPartnerApi(path: string, body: Record<string, unknown>) {
  const { apiKey, useProdServer } = getPbVisionApiKeyParts();
  const server = getPbVisionServer(useProdServer);

  const response = await fetch(`${server}/partner/${path}`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`PB Vision API ${path} failed (${response.status}): ${responseBody}`);
  }

  return responseBody ? JSON.parse(responseBody) : true;
}

async function uploadFileToPbVisionGcs(
  bucket: string,
  objectName: string,
  filePath: string
) {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=resumable&name=${encodeURIComponent(objectName)}`;
  const numBytesTotal = statSync(filePath).size;
  let response = await fetch(url, {
    method: 'POST',
    headers: { 'X-Upload-Content-Length': String(numBytesTotal) },
  });

  if (!response.ok) {
    throw new Error(
      `PB Vision upload failed to initialize (${response.status}): ${await response.text()}`
    );
  }

  const sessionUri = response.headers.get('Location');
  if (!sessionUri) {
    throw new Error('PB Vision upload failed to initialize: missing session URI');
  }

  const minChunkSize = 256 * 1024;
  const chunkSize = Math.max(minChunkSize, 8 * 1024 * 1024);
  let startIdx = 0;

  while (startIdx < numBytesTotal) {
    const endIdx = Math.min(startIdx + chunkSize - 1, numBytesTotal - 1);
    const chunk = await new Promise<Buffer>((resolve, reject) => {
      const buffer = Buffer.alloc(endIdx - startIdx + 1);
      let bytesRead = 0;
      const stream = createReadStream(filePath, { start: startIdx, end: endIdx });
      stream.on('data', (data) => {
        const chunkBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        chunkBuffer.copy(buffer, bytesRead);
        bytesRead += chunkBuffer.length;
      });
      stream.on('end', () => resolve(buffer));
      stream.on('error', reject);
    });

    response = await fetch(sessionUri, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${startIdx}-${endIdx}/${numBytesTotal}`,
      },
      body: new Uint8Array(chunk),
    });

    if (response.status >= 400) {
      throw new Error(
        `PB Vision upload failed at byte ${startIdx} (${response.status}): ${await response.text()}`
      );
    }

    startIdx = endIdx + 1;
  }
}

export function shouldFallbackToPbVisionFileUpload(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message;
  return (
    message.includes('videoSecs') ||
    message.includes('add_video_by_url failed (500)')
  );
}

export async function submitVideoUrlToPBVision({
  videoUrl,
  metadata,
}: {
  videoUrl: string;
  metadata: PBVisionSubmitMetadata;
}): Promise<{ vid: string }> {
  const pbv = getPBVisionClient();

  console.log('[PB Vision] Submitting add_video_by_url', {
    userEmailCount: metadata.userEmails.length,
    urlEndsWithMp4: videoUrl.split('?')[0].endsWith('.mp4'),
  });

  const result = await pbv.sendVideoUrlToDownload(videoUrl, toPbvMetadata(metadata));

  return { vid: result.vid };
}

export async function submitVideoFileToPBVision({
  filePath,
  metadata,
}: {
  filePath: string;
  metadata: PBVisionSubmitMetadata;
}): Promise<{ vid: string }> {
  if (metadata.videoSecs == null || metadata.videoSecs <= 0) {
    throw new Error('Video duration (videoSecs) is required for PB Vision direct upload');
  }

  const pieces = filePath.split('.');
  const ext = pieces[pieces.length - 1] || 'mp4';
  const { uid, useProdServer } = getPbVisionApiKeyParts();

  const makeVideoBody: Record<string, unknown> = {
    platform: { name: 'api', version: '0.1.14' },
    userEmails: metadata.userEmails,
    fileExt: ext,
    videoSecs: metadata.videoSecs,
  };

  if (metadata.name != null) makeVideoBody.name = metadata.name;
  if (metadata.desc != null) makeVideoBody.desc = metadata.desc;
  if (metadata.gameStartEpoch != null) makeVideoBody.gameStartEpoch = metadata.gameStartEpoch;
  if (metadata.facility != null) makeVideoBody.facility = metadata.facility;
  if (metadata.court != null) makeVideoBody.court = metadata.court;

  console.log('[PB Vision] Submitting make_video_id + upload', {
    filePath,
    fileExt: ext,
    videoSecs: metadata.videoSecs,
    userEmailCount: metadata.userEmails.length,
  });

  const makeResult = (await callPBVisionPartnerApi(
    'make_video_id',
    makeVideoBody
  )) as { hasCredits?: boolean; vid?: string };

  if (makeResult.hasCredits === false) {
    throw new Error('PB Vision credits unavailable for this upload');
  }
  if (!makeResult.vid) {
    throw new Error('PB Vision make_video_id did not return a video id');
  }

  const bucket = `pbv-uploads${useProdServer ? '' : '-dev'}`;
  const objectName = `${uid}/${makeResult.vid}.${ext}`;
  await uploadFileToPbVisionGcs(bucket, objectName, filePath);

  return { vid: makeResult.vid };
}

export async function submitVideoS3KeyToPBVision({
  s3Key,
  metadata,
}: {
  s3Key: string;
  metadata: PBVisionSubmitMetadata;
}): Promise<{ vid: string; method: 'url' | 'upload' }> {
  if (s3Key.toLowerCase().endsWith('.mp4')) {
    try {
      const signedUrl = await createSignedMp4FetchUrl(s3Key);
      const result = await submitVideoUrlToPBVision({
        videoUrl: signedUrl,
        metadata,
      });
      return { vid: result.vid, method: 'url' };
    } catch (error) {
      if (!shouldFallbackToPbVisionFileUpload(error)) {
        throw error;
      }

      console.warn('[PB Vision] URL submit failed, falling back to direct upload', {
        s3_key: s3Key,
        error: error instanceof Error ? error.message : error,
      });
    }
  } else {
    console.log('[PB Vision] S3 key missing .mp4 extension, using direct upload', {
      s3_key: s3Key,
    });
  }

  const { filePath, cleanup } = await downloadS3ObjectToTempFile(s3Key);
  try {
    const result = await submitVideoFileToPBVision({
      filePath,
      metadata,
    });
    return { vid: result.vid, method: 'upload' };
  } finally {
    await cleanup();
  }
}

/** Register PB Vision webhook URL (run once per environment). */
export async function configurePBVisionWebhook(webhookUrl?: string) {
  const url = (webhookUrl ?? process.env.PBVISION_WEBHOOK_URL)?.trim();
  if (!url) {
    throw new Error('PBVISION_WEBHOOK_URL is not configured');
  }

  const pbv = getPBVisionClient();
  await pbv.setWebhook(url);
}
