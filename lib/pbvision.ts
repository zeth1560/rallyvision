import { PBVision } from '@pbvision/partner-sdk';
import { createPbVisionSourceUrl } from '@/lib/pb-vision-source-url';
import {
  createSignedMp4FetchUrl,
  downloadS3ObjectToTempFile,
  ensureS3ObjectHasVideoMp4ContentType,
  getS3ObjectContentLength,
  MAX_PBV_PROXY_BYTES,
} from '@/lib/s3';

export type PBVisionSubmitMetadata = {
  userEmails: string[];
  name?: string;
  desc?: string;
  gameStartEpoch?: number;
  facility?: string;
  court?: string;
};

let pbvClient: PBVision | null = null;

function getPBVisionClient(): PBVision {
  const apiKey = process.env.PBVISION_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('PBVISION_API_KEY is not configured');
  }

  if (!pbvClient) {
    pbvClient = new PBVision(apiKey, {
      useProdServer: process.env.PBVISION_USE_PROD_SERVER === 'true',
    });
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

export function shouldRetryPbVisionWithAlternateSource(error: unknown): boolean {
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
  const pbv = getPBVisionClient();

  console.log('[PB Vision] Submitting uploadVideo', {
    filePath,
    userEmailCount: metadata.userEmails.length,
  });

  const result = await pbv.uploadVideo(filePath, toPbvMetadata(metadata));
  if (result.hasCredits === false) {
    throw new Error('PB Vision credits unavailable for this upload');
  }
  if (!result.vid) {
    throw new Error('PB Vision upload did not return a video id');
  }

  return { vid: result.vid };
}

async function submitViaSignedS3Url(
  s3Key: string,
  metadata: PBVisionSubmitMetadata
): Promise<{ vid: string }> {
  const signedUrl = await createSignedMp4FetchUrl(s3Key);
  return submitVideoUrlToPBVision({
    videoUrl: signedUrl,
    metadata,
  });
}

async function submitViaProxyUrl(
  s3Key: string,
  metadata: PBVisionSubmitMetadata
): Promise<{ vid: string }> {
  const contentLength = await getS3ObjectContentLength(s3Key);
  if (contentLength != null && contentLength > MAX_PBV_PROXY_BYTES) {
    throw new Error(
      `Video is too large for PB Vision proxy fetch (${contentLength} bytes; max ${MAX_PBV_PROXY_BYTES})`
    );
  }

  const proxyUrl = createPbVisionSourceUrl(s3Key);
  console.log('[PB Vision] Submitting add_video_by_url via proxy URL', {
    s3_key: s3Key,
    urlEndsWithMp4: proxyUrl.split('?')[0].endsWith('.mp4'),
  });

  return submitVideoUrlToPBVision({
    videoUrl: proxyUrl,
    metadata,
  });
}

export async function submitVideoS3KeyToPBVision({
  s3Key,
  metadata,
}: {
  s3Key: string;
  metadata: PBVisionSubmitMetadata;
}): Promise<{ vid: string; method: 'url' | 'proxy' | 'upload' }> {
  await ensureS3ObjectHasVideoMp4ContentType(s3Key);

  if (s3Key.toLowerCase().endsWith('.mp4')) {
    try {
      const result = await submitViaSignedS3Url(s3Key, metadata);
      return { vid: result.vid, method: 'url' };
    } catch (error) {
      if (!shouldRetryPbVisionWithAlternateSource(error)) {
        throw error;
      }

      console.warn('[PB Vision] Signed S3 URL submit failed, trying proxy URL', {
        s3_key: s3Key,
        error: error instanceof Error ? error.message : error,
      });
    }

    try {
      const result = await submitViaProxyUrl(s3Key, metadata);
      return { vid: result.vid, method: 'proxy' };
    } catch (error) {
      if (!shouldRetryPbVisionWithAlternateSource(error)) {
        throw error;
      }

      console.warn('[PB Vision] Proxy URL submit failed, trying direct upload', {
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
