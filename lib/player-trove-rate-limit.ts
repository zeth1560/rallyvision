import { supabaseAdmin } from '@/lib/supabase-admin';

export const EMAIL_REQUEST_LIMIT = 3;
export const IP_REQUEST_LIMIT = 10;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export const RATE_LIMIT_MESSAGE =
  'Too many requests. Please wait a few minutes and try again.';

function windowStartIso() {
  return new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function getRequestClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

type RateLimitCheckResult =
  | { allowed: true }
  | { allowed: false; reason: 'email' | 'ip' };

export async function checkPlayerTroveLinkRateLimit(
  email: string,
  ipAddress: string
): Promise<RateLimitCheckResult> {
  const since = windowStartIso();
  const normalizedEmail = email.toLowerCase().trim();

  const { count: emailCount, error: emailError } = await supabaseAdmin
    .from('player_trove_link_requests')
    .select('id', { count: 'exact', head: true })
    .eq('email', normalizedEmail)
    .gte('created_at', since);

  if (emailError) {
    console.error('[PlayerTrove] Email rate-limit lookup failed', {
      error: emailError.message,
    });
    throw emailError;
  }

  if ((emailCount ?? 0) >= EMAIL_REQUEST_LIMIT) {
    return { allowed: false, reason: 'email' };
  }

  const { count: ipCount, error: ipError } = await supabaseAdmin
    .from('player_trove_link_requests')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', ipAddress)
    .gte('created_at', since);

  if (ipError) {
    console.error('[PlayerTrove] IP rate-limit lookup failed', {
      error: ipError.message,
    });
    throw ipError;
  }

  if ((ipCount ?? 0) >= IP_REQUEST_LIMIT) {
    return { allowed: false, reason: 'ip' };
  }

  return { allowed: true };
}

export async function recordPlayerTroveLinkRequest(
  email: string,
  ipAddress: string
) {
  const normalizedEmail = email.toLowerCase().trim();

  const { error } = await supabaseAdmin.from('player_trove_link_requests').insert({
    email: normalizedEmail,
    ip_address: ipAddress,
  });

  if (error) {
    console.error('[PlayerTrove] Failed to record link request', {
      error: error.message,
    });
    throw error;
  }
}
