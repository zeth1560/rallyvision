import { verifyPlayerTroveToken } from '@/lib/player-trove-token';

export const PLAYER_TROVE_AUTH_ERROR = 'Invalid or expired access link';

export type PlayerTroveViewerAuth =
  | { ok: true; email: string; auth: 'token' | 'dev_email' }
  | { ok: false; status: number; error: string };

/**
 * Resolve viewer email from query params.
 * Production: signed ?token= required.
 * Development: ?token= or ?email= (email query is dev-only).
 */
export function resolvePlayerTroveViewerEmail(
  searchParams: URLSearchParams
): PlayerTroveViewerAuth {
  const token = searchParams.get('token')?.trim();
  const emailParam = searchParams.get('email')?.trim();
  const isProduction = process.env.NODE_ENV === 'production';

  if (token) {
    const verified = verifyPlayerTroveToken(token);
    if (!verified) {
      return { ok: false, status: 401, error: PLAYER_TROVE_AUTH_ERROR };
    }
    return { ok: true, email: verified.email, auth: 'token' };
  }

  if (isProduction) {
    return { ok: false, status: 401, error: PLAYER_TROVE_AUTH_ERROR };
  }

  // TODO(dev-only): ?email= without token is for local development only.
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
