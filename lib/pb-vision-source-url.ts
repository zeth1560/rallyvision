import { createHmac, timingSafeEqual } from 'crypto';

const PB_VISION_SOURCE_PURPOSE = 'pb_vision_source';
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;

type PbVisionSourcePayload = {
  s3Key: string;
  purpose: string;
  exp: number;
};

function base64UrlEncode(data: string | Buffer): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): Buffer {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function getTokenSecret(): string {
  const secret = process.env.PLAYERTROVE_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error('PLAYERTROVE_TOKEN_SECRET is not configured');
  }
  return secret;
}

function getPublicBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  if (!configured) {
    throw new Error(
      'NEXT_PUBLIC_BASE_URL (or NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL) is not set'
    );
  }

  return configured.replace(/\/$/, '');
}

export function createPbVisionSourceFileName(
  s3Key: string,
  expiresInSeconds = DEFAULT_TTL_SECONDS
): string {
  const payload: PbVisionSourcePayload = {
    s3Key,
    purpose: PB_VISION_SOURCE_PURPOSE,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };

  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(
    createHmac('sha256', getTokenSecret()).update(payloadSegment).digest()
  );

  return `${payloadSegment}.${signature}.mp4`;
}

export function createPbVisionSourceUrl(
  s3Key: string,
  expiresInSeconds = DEFAULT_TTL_SECONDS
): string {
  const fileName = createPbVisionSourceFileName(s3Key, expiresInSeconds);
  return `${getPublicBaseUrl()}/api/pb-vision/source/${fileName}`;
}

export function verifyPbVisionSourceFileName(
  fileName: string
): { s3Key: string } | null {
  if (!fileName.toLowerCase().endsWith('.mp4')) {
    return null;
  }

  const token = fileName.slice(0, -4);
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadSegment, signature] = parts;
  if (!payloadSegment || !signature) {
    return null;
  }

  const expectedSignature = base64UrlEncode(
    createHmac('sha256', getTokenSecret()).update(payloadSegment).digest()
  );

  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    return null;
  }

  let payload: PbVisionSourcePayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadSegment).toString('utf8'));
  } catch {
    return null;
  }

  if (
    payload.purpose !== PB_VISION_SOURCE_PURPOSE ||
    typeof payload.s3Key !== 'string' ||
    !payload.s3Key.trim() ||
    typeof payload.exp !== 'number'
  ) {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return { s3Key: payload.s3Key.trim() };
}
