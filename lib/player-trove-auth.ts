import type { NextRequest } from 'next/server';
import { verifyPlayerTroveToken } from '@/lib/player-trove-token';

export const PLAYER_TROVE_AUTH_ERROR = 'Invalid or expired access link';
export const PLAYER_TROVE_TOKEN_COOKIE = 'player_trove_token';
export const PLAYER_TROVE_TOKEN_COOKIE_MAX_AGE = 24 * 60 * 60;

export type PlayerTroveViewerAuth =
  | { ok: true; email: string; auth: 'token' | 'cookie' | 'dev_email' }
  | { ok: false; status: number; error: string };

export function getPlayerTrovePublicBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

function verifyTokenOrFail(token: string): PlayerTroveViewerAuth {
  const verified = verifyPlayerTroveToken(token);
  if (!verified) {
    return { ok: false, status: 401, error: PLAYER_TROVE_AUTH_ERROR };
  }

  return { ok: true, email: verified.email, auth: 'token' };
}

/**
 * Resolve viewer email from query params and optional HttpOnly session cookie.
 * Production: signed ?token= or session cookie required.
 * Development: ?token=, cookie, or ?email= (email query is dev-only).
 */
export function resolvePlayerTroveViewerEmail(
  searchParams: URLSearchParams,
  cookieToken?: string | null
): PlayerTroveViewerAuth {
  const queryToken = searchParams.get('token')?.trim();
  const sessionToken = cookieToken?.trim();
  const emailParam = searchParams.get('email')?.trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (queryToken) {
    return verifyTokenOrFail(queryToken);
  }

  if (sessionToken) {
    const verified = verifyPlayerTroveToken(sessionToken);
    if (!verified) {
      return { ok: false, status: 401, error: PLAYER_TROVE_AUTH_ERROR };
    }

    return { ok: true, email: verified.email, auth: 'cookie' };
  }

  if (isProduction) {
    return { ok: false, status: 401, error: PLAYER_TROVE_AUTH_ERROR };
  }

  if (emailParam) {
    return {
      ok: true,
      email: emailParam.toLowerCase().trim(),
      auth: 'dev_email',
    };
  }

  return {
    ok: false,
    status: 401,
    error: PLAYER_TROVE_AUTH_ERROR,
  };
}

export function readPlayerTroveTokenFromRequest(
  request: NextRequest,
  bodyToken?: string | null
) {
  const fromBody = bodyToken?.trim();
  if (fromBody) {
    return fromBody;
  }

  const fromQuery = request.nextUrl.searchParams.get('token')?.trim();
  if (fromQuery) {
    return fromQuery;
  }

  return request.cookies.get(PLAYER_TROVE_TOKEN_COOKIE)?.value?.trim() || null;
}

export function verifyPlayerTroveRequestToken(token: string | null) {
  if (!token) {
    return {
      ok: false as const,
      status: 401,
      error: PLAYER_TROVE_AUTH_ERROR,
    };
  }

  const verified = verifyPlayerTroveToken(token);
  if (!verified) {
    return {
      ok: false as const,
      status: 401,
      error: PLAYER_TROVE_AUTH_ERROR,
    };
  }

  return {
    ok: true as const,
    email: verified.email,
  };
}
