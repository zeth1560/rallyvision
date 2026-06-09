import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSignedObjectUrl } from '@/lib/s3';
import { hasCoachReviewPurchaseAccess } from '@/lib/commerce/entitlements';
import {
  BUYER_POSITIONS,
  type BuyerPosition,
  type PlayerNames,
} from '@/lib/pro-review-types';

export { BUYER_POSITIONS, type BuyerPosition, type PlayerNames };

export type ProReviewRequestResult =
  | {
      ok: true;
      request_id: string;
      status: string;
      identification_frame_url: string;
      identification_frame_s3_key: string;
      identification_frame_timestamp_seconds: number;
      frame_id: string;
    }
  | { ok: false; status: number; error: string };

export type ProReviewNextFrameResult =
  | {
      ok: true;
      identification_frame_url: string;
      identification_frame_s3_key: string;
      identification_frame_timestamp_seconds: number;
      frame_id: string;
    }
  | { ok: false; status: number; error: string };

export type ProReviewSubmitResult =
  | { ok: true; request_id: string; status: string }
  | { ok: false; status: number; error: string };

type AccessRow = {
  id: string;
  clip_id: string;
  email: string;
  access_status: string;
  purchased_s3_key: string | null;
  coach_review_purchased_at: string | null;
  coach_review_expires_at: string | null;
};

type ProReviewRequestRow = {
  id: string;
  player_video_access_id: string;
  email: string;
  clip_id: string;
  status: string;
  source_s3_key: string | null;
  identification_frame_s3_key: string | null;
  identification_frame_timestamp_seconds: number | null;
  rejected_frame_ids: string[] | null;
  frame_rejected_count: number;
  buyer_position: string | null;
};

type IdentificationFrameRow = {
  id: string;
  clip_id: string;
  timestamp_seconds: number;
  frame_s3_key: string;
};

const SUBMITTED_STATUSES = new Set([
  'ready_for_reviewer',
  'in_review',
  'completed',
  'failed',
]);

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function parseRejectedFrameIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function getFrameContentType(key: string) {
  const lower = key.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return undefined;
}

async function signIdentificationFrameUrl(s3Key: string) {
  return createSignedObjectUrl(s3Key, getFrameContentType(s3Key));
}

async function resolveSourceS3Key(access: AccessRow): Promise<string | null> {
  if (access.purchased_s3_key?.trim()) {
    return access.purchased_s3_key.trim();
  }

  const { data: clip, error } = await supabaseAdmin
    .from('clips')
    .select('s3_key')
    .eq('id', access.clip_id)
    .single();

  if (error || !clip?.s3_key) {
    return null;
  }

  return clip.s3_key;
}

async function loadAccessForViewer(
  accessId: string,
  viewerEmail: string
): Promise<
  | { ok: true; access: AccessRow }
  | { ok: false; status: number; error: string }
> {
  const normalizedViewer = normalizeEmail(viewerEmail);

  const { data: access, error } = await supabaseAdmin
    .from('player_video_access')
    .select(
      'id, clip_id, email, access_status, purchased_s3_key, coach_review_purchased_at, coach_review_expires_at'
    )
    .eq('id', accessId)
    .single();

  if (error || !access) {
    return { ok: false, status: 404, error: 'Access record not found' };
  }

  const accessRow = access as AccessRow;
  const accessEmail = normalizeEmail(accessRow.email ?? '');

  if (accessEmail !== normalizedViewer) {
    return { ok: false, status: 403, error: 'You do not have access to this clip' };
  }

  if (accessRow.access_status !== 'active') {
    return { ok: false, status: 403, error: 'You do not have access to this clip' };
  }

  if (!hasCoachReviewPurchaseAccess(accessRow)) {
    return {
      ok: false,
      status: 403,
      error: 'Pro Review has not been purchased for this clip',
    };
  }

  if (
    accessRow.coach_review_expires_at &&
    new Date() > new Date(accessRow.coach_review_expires_at)
  ) {
    return {
      ok: false,
      status: 403,
      error: 'Your Pro Review access has expired for this clip',
    };
  }

  return { ok: true, access: accessRow };
}

async function loadRequestForViewer(
  requestId: string,
  viewerEmail: string
): Promise<
  | { ok: true; request: ProReviewRequestRow }
  | { ok: false; status: number; error: string }
> {
  const normalizedViewer = normalizeEmail(viewerEmail);

  const { data: request, error } = await supabaseAdmin
    .from('pro_review_requests')
    .select(
      'id, player_video_access_id, email, clip_id, status, source_s3_key, identification_frame_s3_key, identification_frame_timestamp_seconds, rejected_frame_ids, frame_rejected_count, buyer_position'
    )
    .eq('id', requestId)
    .single();

  if (error || !request) {
    return { ok: false, status: 404, error: 'Pro Review request not found' };
  }

  const requestRow = request as ProReviewRequestRow;
  if (normalizeEmail(requestRow.email) !== normalizedViewer) {
    return { ok: false, status: 403, error: 'You do not have access to this request' };
  }

  return { ok: true, request: requestRow };
}

async function findNextIdentificationFrame(
  clipId: string,
  rejectedFrameIds: string[]
): Promise<IdentificationFrameRow | null> {
  const rejected = new Set(rejectedFrameIds);

  const { data, error } = await supabaseAdmin
    .from('clip_identification_frames')
    .select('id, clip_id, timestamp_seconds, frame_s3_key')
    .eq('clip_id', clipId)
    .order('timestamp_seconds', { ascending: true });

  if (error || !data?.length) {
    return null;
  }

  const nextFrame = (data as IdentificationFrameRow[]).find(
    (frame) => !rejected.has(frame.id)
  );

  return nextFrame ?? null;
}

async function findCurrentIdentificationFrame(
  clipId: string,
  s3Key: string | null,
  timestampSeconds: number | null
): Promise<IdentificationFrameRow | null> {
  if (s3Key) {
    const { data } = await supabaseAdmin
      .from('clip_identification_frames')
      .select('id, clip_id, timestamp_seconds, frame_s3_key')
      .eq('clip_id', clipId)
      .eq('frame_s3_key', s3Key)
      .maybeSingle();

    if (data) {
      return data as IdentificationFrameRow;
    }
  }

  if (timestampSeconds != null) {
    const { data } = await supabaseAdmin
      .from('clip_identification_frames')
      .select('id, clip_id, timestamp_seconds, frame_s3_key')
      .eq('clip_id', clipId)
      .eq('timestamp_seconds', timestampSeconds)
      .maybeSingle();

    if (data) {
      return data as IdentificationFrameRow;
    }
  }

  return null;
}

function frameResponse(
  frame: IdentificationFrameRow,
  frameUrl: string,
  requestId: string,
  status: string
): ProReviewRequestResult {
  return {
    ok: true,
    request_id: requestId,
    status,
    identification_frame_url: frameUrl,
    identification_frame_s3_key: frame.frame_s3_key,
    identification_frame_timestamp_seconds: frame.timestamp_seconds,
    frame_id: frame.id,
  };
}

export async function startPlayerTroveProReviewRequest({
  accessId,
  viewerEmail,
}: {
  accessId: string;
  viewerEmail: string;
}): Promise<ProReviewRequestResult> {
  const accessResult = await loadAccessForViewer(accessId, viewerEmail);
  if (!accessResult.ok) {
    return accessResult;
  }

  const access = accessResult.access;
  const accessEmail = normalizeEmail(access.email);

  const { data: existingRequest } = await supabaseAdmin
    .from('pro_review_requests')
    .select(
      'id, status, source_s3_key, identification_frame_s3_key, identification_frame_timestamp_seconds, rejected_frame_ids, frame_rejected_count'
    )
    .eq('player_video_access_id', accessId)
    .maybeSingle();

  if (existingRequest && SUBMITTED_STATUSES.has(existingRequest.status)) {
    return {
      ok: false,
      status: 409,
      error: 'A Pro Review request has already been submitted for this clip',
    };
  }

  const sourceS3Key = await resolveSourceS3Key(access);
  if (!sourceS3Key) {
    return {
      ok: false,
      status: 404,
      error: 'Video source is not available for this clip',
    };
  }

  let requestId = existingRequest?.id as string | undefined;
  let requestStatus = existingRequest?.status ?? 'requested';
  let rejectedFrameIds = parseRejectedFrameIds(existingRequest?.rejected_frame_ids);

  if (!requestId) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('pro_review_requests')
      .insert({
        player_video_access_id: accessId,
        email: accessEmail,
        clip_id: access.clip_id,
        status: 'requested',
        source_s3_key: sourceS3Key,
      })
      .select('id, status')
      .single();

    if (insertError || !inserted) {
      console.error('[Pro Review] Failed to create request record', {
        access_id: accessId,
        error: insertError?.message,
      });
      return { ok: false, status: 500, error: 'Failed to create Pro Review request' };
    }

    requestId = inserted.id as string;
    requestStatus = inserted.status as string;
  } else if (!existingRequest?.source_s3_key) {
    await supabaseAdmin
      .from('pro_review_requests')
      .update({
        source_s3_key: sourceS3Key,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);
  }

  if (
    existingRequest?.identification_frame_s3_key &&
    existingRequest.identification_frame_timestamp_seconds != null
  ) {
    const currentFrame = await findCurrentIdentificationFrame(
      access.clip_id,
      existingRequest.identification_frame_s3_key,
      existingRequest.identification_frame_timestamp_seconds
    );

    if (currentFrame) {
      const frameUrl = await signIdentificationFrameUrl(currentFrame.frame_s3_key);
      return frameResponse(currentFrame, frameUrl, requestId, requestStatus);
    }
  }

  const nextFrame = await findNextIdentificationFrame(access.clip_id, rejectedFrameIds);
  if (!nextFrame) {
    return {
      ok: false,
      status: 404,
      error: 'Identification frames are not available yet for this video.',
    };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from('pro_review_requests')
    .update({
      identification_frame_s3_key: nextFrame.frame_s3_key,
      identification_frame_timestamp_seconds: nextFrame.timestamp_seconds,
      updated_at: now,
    })
    .eq('id', requestId);

  if (updateError) {
    console.error('[Pro Review] Failed to assign identification frame', {
      request_id: requestId,
      error: updateError.message,
    });
    return { ok: false, status: 500, error: 'Failed to prepare identification frame' };
  }

  const frameUrl = await signIdentificationFrameUrl(nextFrame.frame_s3_key);

  console.log('[Pro Review] Request started', {
    access_id: accessId,
    request_id: requestId,
    clip_id: access.clip_id,
    frame_id: nextFrame.id,
    source_s3_key: sourceS3Key,
  });

  return frameResponse(nextFrame, frameUrl, requestId, requestStatus);
}

export async function nextPlayerTroveProReviewFrame({
  requestId,
  viewerEmail,
}: {
  requestId: string;
  viewerEmail: string;
}): Promise<ProReviewNextFrameResult> {
  const requestResult = await loadRequestForViewer(requestId, viewerEmail);
  if (!requestResult.ok) {
    return requestResult;
  }

  const request = requestResult.request;

  if (request.status !== 'requested') {
    return {
      ok: false,
      status: 409,
      error: 'This Pro Review request can no longer be updated',
    };
  }

  const rejectedFrameIds = parseRejectedFrameIds(request.rejected_frame_ids);
  const currentFrame = await findCurrentIdentificationFrame(
    request.clip_id,
    request.identification_frame_s3_key,
    request.identification_frame_timestamp_seconds
  );

  let updatedRejectedIds = rejectedFrameIds;
  let updatedRejectedCount = request.frame_rejected_count;

  if (currentFrame && !rejectedFrameIds.includes(currentFrame.id)) {
    updatedRejectedIds = [...rejectedFrameIds, currentFrame.id];
    updatedRejectedCount += 1;
  }

  const nextFrame = await findNextIdentificationFrame(
    request.clip_id,
    updatedRejectedIds
  );

  if (!nextFrame) {
    return {
      ok: false,
      status: 404,
      error: 'No more identification frames are available for this video.',
    };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from('pro_review_requests')
    .update({
      rejected_frame_ids: updatedRejectedIds,
      frame_rejected_count: updatedRejectedCount,
      identification_frame_s3_key: nextFrame.frame_s3_key,
      identification_frame_timestamp_seconds: nextFrame.timestamp_seconds,
      buyer_position: null,
      updated_at: now,
    })
    .eq('id', requestId);

  if (updateError) {
    console.error('[Pro Review] Failed to advance identification frame', {
      request_id: requestId,
      error: updateError.message,
    });
    return { ok: false, status: 500, error: 'Failed to load the next identification frame' };
  }

  const frameUrl = await signIdentificationFrameUrl(nextFrame.frame_s3_key);

  console.log('[Pro Review] Next identification frame selected', {
    request_id: requestId,
    frame_id: nextFrame.id,
    frame_rejected_count: updatedRejectedCount,
  });

  return {
    ok: true,
    identification_frame_url: frameUrl,
    identification_frame_s3_key: nextFrame.frame_s3_key,
    identification_frame_timestamp_seconds: nextFrame.timestamp_seconds,
    frame_id: nextFrame.id,
  };
}

export function isValidBuyerPosition(value: string): value is BuyerPosition {
  return BUYER_POSITIONS.includes(value as BuyerPosition);
}

export function sanitizePlayerNames(
  input: unknown,
  buyerPosition: BuyerPosition
): PlayerNames {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const names: PlayerNames = {};
  for (const position of BUYER_POSITIONS) {
    if (position === buyerPosition) {
      continue;
    }

    const raw = (input as Record<string, unknown>)[position];
    if (typeof raw === 'string' && raw.trim()) {
      names[position] = raw.trim();
    }
  }

  return names;
}

export async function submitPlayerTroveProReviewRequest({
  requestId,
  viewerEmail,
  focusNotes,
  skillLevel,
  specificMomentNotes,
  additionalNotes,
  buyerPosition,
  playerNames,
}: {
  requestId: string;
  viewerEmail: string;
  focusNotes?: string | null;
  skillLevel?: string | null;
  specificMomentNotes?: string | null;
  additionalNotes?: string | null;
  buyerPosition: string;
  playerNames?: unknown;
}): Promise<ProReviewSubmitResult> {
  const requestResult = await loadRequestForViewer(requestId, viewerEmail);
  if (!requestResult.ok) {
    return requestResult;
  }

  const request = requestResult.request;

  if (request.status !== 'requested') {
    return {
      ok: false,
      status: 409,
      error: 'This Pro Review request has already been submitted',
    };
  }

  if (!isValidBuyerPosition(buyerPosition)) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid buyer position',
    };
  }

  if (!request.identification_frame_s3_key) {
    return {
      ok: false,
      status: 400,
      error: 'An identification frame must be selected before submitting',
    };
  }

  const sanitizedNames = sanitizePlayerNames(playerNames, buyerPosition);
  const now = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from('pro_review_requests')
    .update({
      focus_notes: focusNotes?.trim() || null,
      skill_level: skillLevel?.trim() || null,
      specific_moment_notes: specificMomentNotes?.trim() || null,
      additional_notes: additionalNotes?.trim() || null,
      buyer_position: buyerPosition,
      player_names: sanitizedNames,
      status: 'ready_for_reviewer',
      submitted_at: now,
      ready_for_reviewer_at: now,
      updated_at: now,
    })
    .eq('id', requestId);

  if (updateError) {
    console.error('[Pro Review] Failed to submit request', {
      request_id: requestId,
      error: updateError.message,
    });
    return { ok: false, status: 500, error: 'Failed to submit Pro Review request' };
  }

  console.log('[Pro Review] Request submitted', {
    request_id: requestId,
    buyer_position: buyerPosition,
  });

  return {
    ok: true,
    request_id: requestId,
    status: 'ready_for_reviewer',
  };
}
