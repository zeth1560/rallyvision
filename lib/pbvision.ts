import { PBVision } from '@pbvision/partner-sdk';
import {
  formatPbVisionPrepFailureMessage,
  getPbVisionPrepStrategies,
  inspectSourceMp4FromS3,
  PbVisionPrepSkippedError,
  preparePbVisionCopy,
  type PbVisionPrepStrategy,
} from '@/lib/pb-vision-mp4-prep';
import { createPbVisionSourceUrl } from '@/lib/pb-vision-source-url';
import {
  createSignedMp4FetchUrl,
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

export type PbVisionSubmitMethod = 'url' | 'proxy' | 'prepared-url' | 'prepared-proxy';

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
): Promise<{ vid: string } | null> {
  const contentLength = await getS3ObjectContentLength(s3Key);
  if (contentLength != null && contentLength > MAX_PBV_PROXY_BYTES) {
    console.warn('[PB Vision] Skipping proxy URL because file exceeds proxy limit', {
      s3_key: s3Key,
      content_length: contentLength,
      max_proxy_bytes: MAX_PBV_PROXY_BYTES,
    });
    return null;
  }

  const proxyUrl = createPbVisionSourceUrl(s3Key);
  console.log('[PB Vision] Submitting add_video_by_url via proxy URL', {
    s3_key: s3Key,
    urlEndsWithMp4: proxyUrl.split('?')[0].endsWith('.mp4'),
  });

  const result = await submitVideoUrlToPBVision({
    videoUrl: proxyUrl,
    metadata,
  });
  return result;
}

async function submitViaUrlSources(
  s3Key: string,
  metadata: PBVisionSubmitMetadata
): Promise<{ vid: string; method: 'url' | 'proxy' } | null> {
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
    if (result) {
      return { vid: result.vid, method: 'proxy' };
    }
  } catch (error) {
    if (!shouldRetryPbVisionWithAlternateSource(error)) {
      throw error;
    }

    console.warn('[PB Vision] Proxy URL submit failed', {
      s3_key: s3Key,
      error: error instanceof Error ? error.message : error,
    });
  }

  return null;
}

async function submitPreparedCopy(
  sourceKey: string,
  strategy: PbVisionPrepStrategy,
  metadata: PBVisionSubmitMetadata
): Promise<{ vid: string; method: PbVisionSubmitMethod } | null> {
  let cleanupPreparedCopy: (() => Promise<void>) | null = null;
  let keepPreparedCopy = false;

  try {
    const prepared = await preparePbVisionCopy(sourceKey, strategy);
    cleanupPreparedCopy = prepared.cleanup;

    const result = await submitViaUrlSources(prepared.stagingKey, metadata);
    if (!result) {
      return null;
    }

    keepPreparedCopy = true;
    return {
      vid: result.vid,
      method: result.method === 'proxy' ? 'prepared-proxy' : 'prepared-url',
    };
  } finally {
    if (cleanupPreparedCopy && !keepPreparedCopy) {
      await cleanupPreparedCopy();
    }
  }
}

export async function submitVideoS3KeyToPBVision({
  s3Key,
  metadata,
}: {
  s3Key: string;
  metadata: PBVisionSubmitMetadata;
}): Promise<{ vid: string; method: PbVisionSubmitMethod }> {
  await ensureS3ObjectHasVideoMp4ContentType(s3Key);

  if (!s3Key.toLowerCase().endsWith('.mp4')) {
    throw new Error('Video file must be an MP4 for PB Vision analysis');
  }

  const initialAttempt = await submitViaUrlSources(s3Key, metadata);
  if (initialAttempt) {
    return initialAttempt;
  }

  const contentLength = await getS3ObjectContentLength(s3Key);
  const prepStrategies = getPbVisionPrepStrategies(contentLength);

  for (const strategy of prepStrategies) {
    try {
      const preparedAttempt = await submitPreparedCopy(s3Key, strategy, metadata);
      if (preparedAttempt) {
        return preparedAttempt;
      }
    } catch (error) {
      if (error instanceof PbVisionPrepSkippedError) {
        console.warn('[PB Vision] Skipping prep strategy', {
          source_key: s3Key,
          strategy,
          reason: error.message,
        });
        continue;
      }

      if (!shouldRetryPbVisionWithAlternateSource(error)) {
        throw error;
      }

      console.warn('[PB Vision] Prepared copy submit failed', {
        source_key: s3Key,
        strategy,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  const inspection =
    contentLength != null && contentLength > 300 * 1024 * 1024
      ? null
      : await inspectSourceMp4FromS3(s3Key);
  throw new Error(formatPbVisionPrepFailureMessage(inspection));
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
