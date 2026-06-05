import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  hasVideoBaseAccess,
  getVideoBaseAccessDenialReason,
  type AccessEntitlementRow,
} from '@/lib/commerce/entitlements';
import type { ClipDurationInput } from '@/lib/commerce/products';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HdDownloadKeySource = 'purchased_s3_key' | 'clip.s3_key';

export type ResolvedHdDownload = {
  s3Key: string;
  keySource: HdDownloadKeySource;
  filename: string;
  clipId: string;
  accessId: string | null;
  sessionId: string | null;
  downloadExpiresAt: string | null;
};

type AccessRow = AccessEntitlementRow & {
  id: string;
  clip_id: string;
  email?: string;
  purchased_s3_key: string | null;
  access_status: string;
};

type ClipRow = {
  title: string | null;
  slug: string | null;
  s3_key: string | null;
  duration_seconds: number | null;
};

type ResolveSuccess = { ok: true; download: ResolvedHdDownload };
type ResolveFailure = { ok: false; status: number; error: string };
export type ResolveHdDownloadResult = ResolveSuccess | ResolveFailure;

export function safeDownloadFilename(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
}

export function buildClipDownloadFilename(
  title: string | null | undefined,
  slug: string | null | undefined,
  clipId: string
) {
  const base = safeDownloadFilename(title || slug || clipId || 'clip');
  return `${base}.mp4`;
}

async function fetchClip(clipId: string): Promise<ClipRow | null> {
  const { data, error } = await supabaseAdmin
    .from('clips')
    .select('title, slug, s3_key, duration_seconds')
    .eq('id', clipId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

function resolveS3Key(
  access: AccessRow | null,
  clip: ClipRow | null
): { s3Key: string | null; keySource: HdDownloadKeySource | null } {
  if (access?.purchased_s3_key) {
    return {
      s3Key: access.purchased_s3_key,
      keySource: 'purchased_s3_key',
    };
  }

  if (clip?.s3_key) {
    return { s3Key: clip.s3_key, keySource: 'clip.s3_key' };
  }

  return { s3Key: null, keySource: null };
}

export function logHdDownload(route: string, context: Record<string, unknown>) {
  console.log(`[HD Download] ${route}`, {
    ...context,
    timestamp: new Date().toISOString(),
  });
}

function logHdDownloadFailure(
  route: string,
  context: Record<string, unknown>
) {
  console.warn(`[HD Download] ${route} failed`, {
    ...context,
    timestamp: new Date().toISOString(),
  });
}

function buildResolvedDownload(
  clipId: string,
  clip: ClipRow,
  access: AccessRow | null,
  s3Key: string,
  keySource: HdDownloadKeySource,
  sessionId: string | null
): ResolvedHdDownload {
  return {
    s3Key,
    keySource,
    filename: buildClipDownloadFilename(clip.title, clip.slug, clipId),
    clipId,
    accessId: access?.id ?? null,
    sessionId,
    downloadExpiresAt: access?.download_expires_at ?? null,
  };
}

function validateAccessRecord(
  route: string,
  access: AccessRow | null,
  clip: ClipDurationInput | null,
  context: Record<string, unknown>
): ResolveFailure | null {
  if (!access) {
    return null;
  }

  if (access.access_status !== 'active') {
    logHdDownloadFailure(route, {
      ...context,
      access_id: access.id,
      access_status: access.access_status,
      reason: 'inactive_access',
    });
    return {
      ok: false,
      status: 403,
      error: 'You do not have access to this clip',
    };
  }

  if (clip) {
    const denialReason = getVideoBaseAccessDenialReason(access, clip);

    if (denialReason === 'expired') {
      logHdDownloadFailure(route, {
        ...context,
        access_id: access.id,
        expired: true,
        download_expires_at: access.download_expires_at,
        reason: 'download_expired',
      });
      return {
        ok: false,
        status: 403,
        error: 'Your download access has expired for this clip',
      };
    }

    if (denialReason === 'never_purchased' || !hasVideoBaseAccess(access, clip)) {
      logHdDownloadFailure(route, {
        ...context,
        access_id: access.id,
        reason: 'base_product_not_purchased',
      });
      return {
        ok: false,
        status: 403,
        error: 'You do not have download access for this clip',
      };
    }
  }

  if (
    !clip &&
    access.download_expires_at &&
    new Date() > new Date(access.download_expires_at)
  ) {
    logHdDownloadFailure(route, {
      ...context,
      access_id: access.id,
      expired: true,
      download_expires_at: access.download_expires_at,
      reason: 'download_expired',
    });
    return {
      ok: false,
      status: 403,
      error: 'Your download access has expired for this clip',
    };
  }

  if (clip && access.download_expires_at && new Date() > new Date(access.download_expires_at)) {
    logHdDownloadFailure(route, {
      ...context,
      access_id: access.id,
      expired: true,
      download_expires_at: access.download_expires_at,
      reason: 'download_expired',
    });
    return {
      ok: false,
      status: 403,
      error: 'Your download access has expired for this clip',
    };
  }

  return null;
}

export async function resolveHdDownloadByAccessId(
  accessId: string,
  route = '/api/player-trove/download',
  viewerEmail?: string
): Promise<ResolveHdDownloadResult> {
  logHdDownload(route, {
    access_id: accessId,
    phase: 'start',
    has_viewer_email: Boolean(viewerEmail),
  });

  const { data: access, error: accessError } = await supabaseAdmin
    .from('player_video_access')
    .select(
      'id, clip_id, email, download_expires_at, purchased_s3_key, access_status, clip_download_purchased_at, hd_download_purchased_at'
    )
    .eq('id', accessId)
    .single();

  if (accessError || !access) {
    logHdDownloadFailure(route, {
      access_id: accessId,
      access_error: accessError?.message,
      reason: 'access_not_found',
    });
    return {
      ok: false,
      status: 404,
      error: 'Access record not found',
    };
  }

  if (viewerEmail) {
    const normalizedViewer = viewerEmail.toLowerCase().trim();
    const normalizedAccessEmail = (access.email ?? '').toLowerCase().trim();

    if (normalizedAccessEmail !== normalizedViewer) {
      logHdDownloadFailure(route, {
        access_id: accessId,
        clip_id: access.clip_id,
        reason: 'email_mismatch',
      });
      return {
        ok: false,
        status: 403,
        error: 'You do not have access to this clip',
      };
    }
  }

  const clip = await fetchClip(access.clip_id);
  if (!clip) {
    logHdDownloadFailure(route, {
      access_id: accessId,
      clip_id: access.clip_id,
      reason: 'clip_not_found',
    });
    return { ok: false, status: 404, error: 'Clip not found' };
  }

  const accessFailure = validateAccessRecord(route, access, clip, {
    access_id: accessId,
    clip_id: access.clip_id,
  });
  if (accessFailure) {
    return accessFailure;
  }

  const { s3Key, keySource } = resolveS3Key(access, clip);
  if (!s3Key || !keySource) {
    logHdDownloadFailure(route, {
      access_id: accessId,
      clip_id: access.clip_id,
      reason: 'no_downloadable_key',
    });
    return {
      ok: false,
      status: 400,
      error: 'No downloadable file is available for this access record',
    };
  }

  logHdDownload(route, {
    access_id: accessId,
    clip_id: access.clip_id,
    key_source: keySource,
    s3_key: s3Key,
    expired: false,
    download_expires_at: access.download_expires_at,
    phase: 'resolved',
  });

  return {
    ok: true,
    download: buildResolvedDownload(
      access.clip_id,
      clip,
      access,
      s3Key,
      keySource,
      null
    ),
  };
}

export async function resolveHdDownloadByPaidOrder({
  clipId,
  stripeCheckoutSessionId,
  email,
  route,
}: {
  clipId: string;
  stripeCheckoutSessionId: string;
  email?: string | null;
  route: string;
}): Promise<ResolveHdDownloadResult> {
  logHdDownload(route, {
    clip_id: clipId,
    session_id: stripeCheckoutSessionId,
    email: email ?? undefined,
    phase: 'start',
  });

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, email')
    .eq('clip_id', clipId)
    .eq('stripe_checkout_session_id', stripeCheckoutSessionId)
    .eq('status', 'paid')
    .maybeSingle();

  if (orderError) {
    logHdDownloadFailure(route, {
      clip_id: clipId,
      session_id: stripeCheckoutSessionId,
      reason: 'order_lookup_error',
      error: orderError.message,
    });
    return { ok: false, status: 500, error: orderError.message };
  }

  if (!order) {
    logHdDownloadFailure(route, {
      clip_id: clipId,
      session_id: stripeCheckoutSessionId,
      reason: 'no_paid_order',
    });
    return {
      ok: false,
      status: 403,
      error: 'You do not have access to this clip',
    };
  }

  const normalizedEmail = (email ?? order.email)?.toLowerCase().trim();

  let accessQuery = supabaseAdmin
    .from('player_video_access')
    .select(
      'id, clip_id, download_expires_at, purchased_s3_key, access_status, clip_download_purchased_at, hd_download_purchased_at'
    )
    .eq('clip_id', clipId)
    .eq('stripe_checkout_session_id', stripeCheckoutSessionId);

  if (normalizedEmail) {
    accessQuery = accessQuery.eq('email', normalizedEmail);
  }

  const { data: accessRecords, error: accessError } = await accessQuery;

  if (accessError) {
    logHdDownloadFailure(route, {
      clip_id: clipId,
      session_id: stripeCheckoutSessionId,
      reason: 'access_lookup_error',
      error: accessError.message,
    });
    return { ok: false, status: 500, error: accessError.message };
  }

  const access = accessRecords?.[0] ?? null;

  const clip = await fetchClip(clipId);
  if (!clip) {
    logHdDownloadFailure(route, {
      clip_id: clipId,
      session_id: stripeCheckoutSessionId,
      reason: 'clip_not_found',
    });
    return { ok: false, status: 404, error: 'Clip not found' };
  }

  const accessFailure = validateAccessRecord(route, access, clip, {
    clip_id: clipId,
    session_id: stripeCheckoutSessionId,
  });
  if (accessFailure) {
    return accessFailure;
  }

  const { s3Key, keySource } = resolveS3Key(access, clip);
  if (!s3Key || !keySource) {
    logHdDownloadFailure(route, {
      clip_id: clipId,
      session_id: stripeCheckoutSessionId,
      access_id: access?.id ?? null,
      reason: 'no_downloadable_key',
    });
    return {
      ok: false,
      status: 400,
      error: 'No downloadable file is available for this clip',
    };
  }

  logHdDownload(route, {
    clip_id: clipId,
    session_id: stripeCheckoutSessionId,
    access_id: access?.id ?? null,
    key_source: keySource,
    s3_key: s3Key,
    expired: false,
    download_expires_at: access?.download_expires_at ?? null,
    phase: 'resolved',
  });

  return {
    ok: true,
    download: buildResolvedDownload(
      clipId,
      clip,
      access,
      s3Key,
      keySource,
      stripeCheckoutSessionId
    ),
  };
}

export async function markAccessDownloaded(accessId: string | null) {
  if (!accessId) {
    return;
  }

  try {
    await supabaseAdmin
      .from('player_video_access')
      .update({ downloaded_at: new Date().toISOString() })
      .eq('id', accessId);
  } catch (updateError) {
    console.warn('[HD Download] Failed to update downloaded_at (column may be missing)', {
      access_id: accessId,
      error: updateError,
    });
  }
}
