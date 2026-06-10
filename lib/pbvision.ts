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
