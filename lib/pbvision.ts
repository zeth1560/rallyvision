import { PBVision } from '@pbvision/partner-sdk';
import { createPbVisionSourceUrl } from '@/lib/pb-vision-source-url';
import { createSignedMp4FetchUrl } from '@/lib/s3';

export type PBVisionSubmitMetadata = {
  userEmails: string[];
  name?: string;
  desc?: string;
  gameStartEpoch?: number;
  facility?: string;
  court?: string;
};

export type PbVisionSubmitMethod = 'url' | 'proxy';

const MAX_PB_VISION_EDITOR_EMAILS = 8;

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

function normalizeEmailList(emails: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const email of emails) {
    const value = email.trim().toLowerCase();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }

  return normalized.slice(0, MAX_PB_VISION_EDITOR_EMAILS);
}

function parsePbVisionEditorLists(response: unknown): {
  editors: string[];
  viewers: string[];
} {
  let payload = response;

  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return { editors: [], viewers: [] };
    }
  }

  if (!payload || typeof payload !== 'object') {
    return { editors: [], viewers: [] };
  }

  const record = payload as Record<string, unknown>;
  const editors = Array.isArray(record.editorEmails)
    ? record.editorEmails
    : Array.isArray(record.editors)
      ? record.editors
      : [];
  const viewers = Array.isArray(record.viewerEmails)
    ? record.viewerEmails
    : Array.isArray(record.viewers)
      ? record.viewers
      : [];

  return {
    editors: normalizeEmailList(
      editors.filter((value): value is string => typeof value === 'string')
    ),
    viewers: normalizeEmailList(
      viewers.filter((value): value is string => typeof value === 'string')
    ),
  };
}

export async function getPbVisionEditorEmails(vid: string) {
  const pbv = getPBVisionClient();
  const response = await pbv.getVideoEditors(vid);
  return parsePbVisionEditorLists(response);
}

export async function syncPbVisionEditorEmails(vid: string, emails: string[]) {
  const pbv = getPBVisionClient();
  const mergedEditors = normalizeEmailList(emails);
  const { viewers } = await getPbVisionEditorEmails(vid);

  if (mergedEditors.length === 0) {
    return;
  }

  await pbv.setVideoEditors(vid, mergedEditors, viewers);
}

export async function addPbVisionEditorEmail(vid: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return;
  }

  const { editors, viewers } = await getPbVisionEditorEmails(vid);
  await syncPbVisionEditorEmails(vid, [...editors, normalizedEmail]);

  if (!editors.includes(normalizedEmail)) {
    console.log('[PB Vision] Granted editor access', {
      pbv_vid: vid,
      email: normalizedEmail,
    });
  }
}

function getPbVisionPartnerEmail(): string | null {
  return process.env.PBVISION_PARTNER_EMAIL?.trim().toLowerCase() || null;
}

export function resolvePbVisionSubmitUserEmails(userEmails: string[]): string[] {
  const normalized = normalizeEmailList(userEmails);
  const partnerEmail = getPbVisionPartnerEmail();

  if (!partnerEmail) {
    return normalized;
  }

  return normalized.filter((email) => email !== partnerEmail);
}

export async function grantPbVisionSubmitUserEmails({
  vid,
  userEmails,
}: {
  vid: string;
  userEmails: string[];
}) {
  const emails = normalizeEmailList(userEmails);
  if (emails.length === 0) {
    return;
  }

  await addPbVisionEditorEmail(vid, emails[0]!);

  if (emails.length > 1) {
    await syncPbVisionEditorEmails(vid, emails);
  }
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

export async function submitVideoS3KeyToPBVision({
  s3Key,
  metadata,
}: {
  s3Key: string;
  metadata: PBVisionSubmitMetadata;
}): Promise<{ vid: string; method: PbVisionSubmitMethod }> {
  if (!s3Key.toLowerCase().endsWith('.mp4')) {
    throw new Error('Video file must be an MP4 for PB Vision analysis');
  }

  const submitMetadata = {
    ...metadata,
    userEmails: resolvePbVisionSubmitUserEmails(metadata.userEmails),
  };

  try {
    const signedUrl = await createSignedMp4FetchUrl(s3Key);
    const result = await submitVideoUrlToPBVision({
      videoUrl: signedUrl,
      metadata: submitMetadata,
    });
    await grantPbVisionSubmitUserEmails({
      vid: result.vid,
      userEmails: metadata.userEmails,
    }).catch((grantError) => {
      console.error('[PB Vision] Failed to grant editor access after submit', {
        pbv_vid: result.vid,
        error: grantError instanceof Error ? grantError.message : grantError,
      });
    });
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

  const proxyUrl = createPbVisionSourceUrl(s3Key);
  console.log('[PB Vision] Submitting add_video_by_url via proxy URL', {
    s3_key: s3Key,
    urlEndsWithMp4: proxyUrl.split('?')[0].endsWith('.mp4'),
  });

  const result = await submitVideoUrlToPBVision({
    videoUrl: proxyUrl,
    metadata: submitMetadata,
  });

  await grantPbVisionSubmitUserEmails({
    vid: result.vid,
    userEmails: metadata.userEmails,
  }).catch((grantError) => {
    console.error('[PB Vision] Failed to grant editor access after proxy submit', {
      pbv_vid: result.vid,
      error: grantError instanceof Error ? grantError.message : grantError,
    });
  });

  return { vid: result.vid, method: 'proxy' };
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
