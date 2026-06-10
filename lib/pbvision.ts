import { PBVision } from '@pbvision/partner-sdk';

export type PBVisionSubmitMetadata = {
  userEmails: string[];
  name?: string;
  desc?: string;
  gameStartEpoch?: number;
  facility?: string;
  court?: string;
  /** Duration in seconds; required by PB Vision when URL probing fails. */
  videoSecs?: number;
};

let pbvClient: PBVision | null = null;

function getPBVisionApiConfig() {
  const apiKey = process.env.PBVISION_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('PBVISION_API_KEY is not configured');
  }

  const useProdServer = process.env.PBVISION_USE_PROD_SERVER === 'true';
  const server = useProdServer
    ? 'https://api-2o2klzx4pa-uc.a.run.app'
    : 'https://api-ko3kowqi6a-uc.a.run.app';

  return { apiKey, server };
}

function getPBVisionClient(): PBVision {
  const { apiKey } = getPBVisionApiConfig();

  if (!pbvClient) {
    pbvClient = new PBVision(apiKey, {
      useProdServer: process.env.PBVISION_USE_PROD_SERVER === 'true',
    });
  }

  return pbvClient;
}

function assertPbVisionVideoUrl(videoUrl: string) {
  if (typeof videoUrl !== 'string' || !videoUrl.startsWith('http')) {
    throw new Error('PB Vision video URL must start with http');
  }

  if (!videoUrl.split('?')[0].endsWith('.mp4')) {
    throw new Error('PB Vision video URL must have the .mp4 extension');
  }
}

async function callPBVisionPartnerApi(path: string, body: Record<string, unknown>) {
  const { apiKey, server } = getPBVisionApiConfig();

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

export async function submitVideoUrlToPBVision({
  videoUrl,
  metadata,
}: {
  videoUrl: string;
  metadata: PBVisionSubmitMetadata;
}): Promise<{ vid: string }> {
  assertPbVisionVideoUrl(videoUrl);

  const {
    userEmails,
    name,
    desc,
    gameStartEpoch,
    facility,
    court,
    videoSecs,
  } = metadata;

  const body: Record<string, unknown> = {
    url: videoUrl,
    userEmails,
  };

  if (name != null) body.name = name;
  if (desc != null) body.desc = desc;
  if (gameStartEpoch != null) body.gameStartEpoch = gameStartEpoch;
  if (facility != null) body.facility = facility;
  if (court != null) body.court = court;
  if (videoSecs != null) body.videoSecs = videoSecs;

  const result = await callPBVisionPartnerApi('add_video_by_url', body);
  return { vid: result.vid as string };
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
