import { createHmac, timingSafeEqual } from 'crypto';

export const PLAYER_TROVE_TOKEN_PURPOSE = 'player_trove_access';
const TOKEN_TTL_SECONDS = 24 * 60 * 60;

type PlayerTroveTokenPayload = {
  email: string;
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
  const secret = process.env.PLAYERTROVE_TOKEN_SECRET;
  if (!secret) {
    throw new Error('PLAYERTROVE_TOKEN_SECRET is not configured');
  }
  return secret;
}

export function createPlayerTroveToken(email: string): string {
  const payload: PlayerTroveTokenPayload = {
    email: email.toLowerCase().trim(),
    purpose: PLAYER_TROVE_TOKEN_PURPOSE,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };

  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(
    createHmac('sha256', getTokenSecret()).update(payloadSegment).digest()
  );

  return `${payloadSegment}.${signature}`;
}

export type VerifiedPlayerTroveToken = {
  email: string;
  exp: number;
};

export function verifyPlayerTroveToken(
  token: string
): VerifiedPlayerTroveToken | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadSegment, signatureSegment] = parts;

  if (!payloadSegment || !signatureSegment) {
    return null;
  }

  let secret: string;
  try {
    secret = getTokenSecret();
  } catch {
    return null;
  }

  const expectedSignature = base64UrlEncode(
    createHmac('sha256', secret).update(payloadSegment).digest()
  );

  const expectedBuf = Buffer.from(expectedSignature);
  const actualBuf = Buffer.from(signatureSegment);

  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return null;
  }

  let payload: PlayerTroveTokenPayload;
  try {
    payload = JSON.parse(
      base64UrlDecode(payloadSegment).toString('utf8')
    ) as PlayerTroveTokenPayload;
  } catch {
    return null;
  }

  if (
    !payload.email ||
    payload.purpose !== PLAYER_TROVE_TOKEN_PURPOSE ||
    typeof payload.exp !== 'number'
  ) {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    email: payload.email.toLowerCase().trim(),
    exp: payload.exp,
  };
}

/** Production uses signed token URLs; development may use ?email= for local testing. */
export function buildPlayerTroveRedirectUrl(email: string): string {
  const normalizedEmail = email.toLowerCase().trim();

  if (process.env.NODE_ENV === 'production') {
    const token = createPlayerTroveToken(normalizedEmail);
    return `/player-trove?token=${encodeURIComponent(token)}`;
  }

  return `/player-trove?email=${encodeURIComponent(normalizedEmail)}`;
}
