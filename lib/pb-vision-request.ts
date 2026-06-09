import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  runPbVisionSubmissionAttempt,
  type PbVisionSubmissionAttemptResult,
} from '@/lib/pb-vision-retry-refund';

export type PbVisionRequestResult = PbVisionSubmissionAttemptResult;

const TERMINAL_STATUSES = new Set(['submitted', 'processing', 'completed']);

async function ensurePbVisionRequestRow({
  accessId,
  accessEmail,
  clipId,
  notes,
}: {
  accessId: string;
  accessEmail: string;
  clipId: string;
  notes?: string | null;
}): Promise<{ ok: true; requestId: string } | { ok: false; status: number; error: string }> {
  const { data: existingRequest } = await supabaseAdmin
    .from('pb_vision_requests')
    .select('id, status, pbv_vid, pbv_webpage_url, refund_status')
    .eq('player_video_access_id', accessId)
    .maybeSingle();

  if (
    existingRequest &&
    TERMINAL_STATUSES.has(existingRequest.status) &&
    existingRequest.refund_status == null
  ) {
    return { ok: true, requestId: existingRequest.id };
  }

  if (existingRequest?.id) {
    if (notes?.trim()) {
      await supabaseAdmin
        .from('pb_vision_requests')
        .update({ notes: notes.trim(), updated_at: new Date().toISOString() })
        .eq('id', existingRequest.id);
    }

    return { ok: true, requestId: existingRequest.id };
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('pb_vision_requests')
    .insert({
      player_video_access_id: accessId,
      email: accessEmail,
      clip_id: clipId,
      status: 'requested',
      notes: notes?.trim() || null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    console.error('[PB Vision] Failed to create request record', {
      access_id: accessId,
      error: insertError?.message,
    });
    return { ok: false, status: 500, error: 'Failed to create PB Vision request' };
  }

  return { ok: true, requestId: inserted.id as string };
}

type PbVisionAutoSubmitVideo = {
  access_id: string;
  clip_id: string;
  duration_seconds: number | null;
  pb_vision_status: string | null;
  pb_vision_refund_status: string | null;
  upsell_offers: Array<{ product: string; status: string }>;
};

export async function autoSubmitPendingPbVisionPurchases({
  email,
  videos,
  clipIds,
}: {
  email: string;
  videos: PbVisionAutoSubmitVideo[];
  clipIds?: string[];
}) {
  const normalizedEmail = email.toLowerCase().trim();
  const clipIdFilter = clipIds ? new Set(clipIds) : null;

  for (const video of videos) {
    if (clipIdFilter && !clipIdFilter.has(video.clip_id)) {
      continue;
    }

    const duration = video.duration_seconds;
    if (duration == null || duration < 5 * 60) {
      continue;
    }

    const pbVisionOffer = video.upsell_offers.find(
      (offer) => offer.product === 'pb_vision'
    );
    if (pbVisionOffer?.status !== 'purchased') {
      continue;
    }

    if (
      video.pb_vision_refund_status === 'completed' ||
      video.pb_vision_refund_status === 'skipped_free'
    ) {
      continue;
    }

    if (
      video.pb_vision_status === 'submitted' ||
      video.pb_vision_status === 'processing' ||
      video.pb_vision_status === 'completed' ||
      video.pb_vision_status === 'failed'
    ) {
      continue;
    }

    try {
      const result = await autoSubmitPbVisionAfterPurchase({
        accessId: video.access_id,
        email: normalizedEmail,
      });

      if (!result.ok) {
        console.error('[PB Vision] Auto-submit after purchase failed', {
          access_id: video.access_id,
          clip_id: video.clip_id,
          error: result.error,
        });
      }
    } catch (error) {
      console.error('[PB Vision] Auto-submit after purchase error', {
        access_id: video.access_id,
        clip_id: video.clip_id,
        error: error instanceof Error ? error.message : error,
      });
    }
  }
}

export async function autoSubmitPbVisionForSessionClips({
  email,
  clipIds,
  videos,
}: {
  email: string;
  clipIds: string[];
  videos: PbVisionAutoSubmitVideo[];
}) {
  await autoSubmitPendingPbVisionPurchases({ email, videos, clipIds });
}

export async function autoSubmitPbVisionAfterPurchase({
  accessId,
  email,
}: {
  accessId: string;
  email: string;
}): Promise<PbVisionRequestResult> {
  const normalizedEmail = email.toLowerCase().trim();

  const { data: access, error: accessError } = await supabaseAdmin
    .from('player_video_access')
    .select('id, clip_id, email, pb_vision_purchased_at, pb_vision_expires_at')
    .eq('id', accessId)
    .single();

  if (accessError || !access) {
    return { ok: false, status: 404, error: 'Access record not found' };
  }

  const accessEmail = (access.email ?? '').toLowerCase().trim();
  if (accessEmail !== normalizedEmail) {
    return { ok: false, status: 403, error: 'Access email mismatch' };
  }

  const { data: existingRequest } = await supabaseAdmin
    .from('pb_vision_requests')
    .select('id, status, pbv_vid, pbv_webpage_url, refund_status')
    .eq('player_video_access_id', accessId)
    .maybeSingle();

  if (
    existingRequest &&
    TERMINAL_STATUSES.has(existingRequest.status) &&
    existingRequest.refund_status == null
  ) {
    return {
      ok: true,
      request_id: existingRequest.id,
      status: existingRequest.status,
      pbv_vid: existingRequest.pbv_vid,
      pbv_webpage_url: existingRequest.pbv_webpage_url,
    };
  }

  if (existingRequest?.status === 'failed') {
    return {
      ok: true,
      request_id: existingRequest.id,
      status: existingRequest.status,
      pbv_vid: null,
      pbv_webpage_url: null,
    };
  }

  const ensured = await ensurePbVisionRequestRow({
    accessId,
    accessEmail,
    clipId: access.clip_id,
  });

  if (!ensured.ok) {
    return ensured;
  }

  return runPbVisionSubmissionAttempt({
    requestId: ensured.requestId,
    source: 'auto_purchase',
  });
}

export async function submitPlayerTrovePbVisionRequest({
  accessId,
  viewerEmail,
  notes,
}: {
  accessId: string;
  viewerEmail: string;
  notes?: string | null;
}): Promise<PbVisionRequestResult> {
  const normalizedViewer = viewerEmail.toLowerCase().trim();

  const { data: access, error: accessError } = await supabaseAdmin
    .from('player_video_access')
    .select('id, clip_id, email')
    .eq('id', accessId)
    .single();

  if (accessError || !access) {
    return { ok: false, status: 404, error: 'Access record not found' };
  }

  const accessEmail = (access.email ?? '').toLowerCase().trim();

  if (accessEmail !== normalizedViewer) {
    return { ok: false, status: 403, error: 'You do not have access to this clip' };
  }

  const { data: existingRequest } = await supabaseAdmin
    .from('pb_vision_requests')
    .select('id, status, pbv_vid, pbv_webpage_url, refund_status')
    .eq('player_video_access_id', accessId)
    .maybeSingle();

  if (
    existingRequest &&
    TERMINAL_STATUSES.has(existingRequest.status) &&
    existingRequest.refund_status == null
  ) {
    return {
      ok: true,
      request_id: existingRequest.id,
      status: existingRequest.status,
      pbv_vid: existingRequest.pbv_vid,
      pbv_webpage_url: existingRequest.pbv_webpage_url,
    };
  }

  const ensured = await ensurePbVisionRequestRow({
    accessId,
    accessEmail,
    clipId: access.clip_id,
    notes,
  });

  if (!ensured.ok) {
    return ensured;
  }

  return runPbVisionSubmissionAttempt({
    requestId: ensured.requestId,
    viewerEmail: normalizedViewer,
    notes,
    source: 'user',
  });
}
