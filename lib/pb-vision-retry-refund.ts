import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSignedMp4FetchUrl } from '@/lib/s3';
import { submitVideoUrlToPBVision, type PBVisionSubmitMetadata } from '@/lib/pbvision';
import { resolveHdDownloadByAccessId } from '@/lib/hd-download';
import { hasPbVisionPurchaseAccess } from '@/lib/commerce/entitlements';
import { sendPbVisionRefundEmail } from '@/lib/email';

export const MAX_PB_VISION_SUBMISSION_ATTEMPTS = 3;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
});

type PbVisionRequestRow = {
  id: string;
  player_video_access_id: string;
  email: string;
  clip_id: string;
  status: string;
  submission_attempt_count: number;
  refund_status: string | null;
  stripe_refund_id: string | null;
  notes: string | null;
};

type ClipMetadata = {
  title: string | null;
  slug: string | null;
  recorded_at: string | null;
  created_at: string | null;
};

type AccessRow = {
  id: string;
  clip_id: string;
  email: string;
  access_status: string;
  pb_vision_purchased_at: string | null;
  pb_vision_expires_at: string | null;
};

function epochSecondsFromIso(iso: string | null | undefined) {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  return Math.floor(ms / 1000);
}

async function fetchClipMetadata(clipId: string): Promise<ClipMetadata | null> {
  const { data, error } = await supabaseAdmin
    .from('clips')
    .select('title, slug, recorded_at, created_at')
    .eq('id', clipId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

async function fetchClubCourtNames(clipId: string) {
  const { data: clip } = await supabaseAdmin
    .from('clips')
    .select('club_id, court_id')
    .eq('id', clipId)
    .single();

  if (!clip?.club_id && !clip?.court_id) {
    return { facility: undefined, court: undefined };
  }

  const [clubResult, courtResult] = await Promise.all([
    clip.club_id
      ? supabaseAdmin.from('clubs').select('name').eq('id', clip.club_id).single()
      : Promise.resolve({ data: null }),
    clip.court_id
      ? supabaseAdmin.from('courts').select('name').eq('id', clip.court_id).single()
      : Promise.resolve({ data: null }),
  ]);

  return {
    facility: clubResult.data?.name ?? undefined,
    court: courtResult.data?.name ?? undefined,
  };
}

function buildPbVisionMetadata({
  email,
  accessId,
  requestId,
  clip,
  facility,
  court,
}: {
  email: string;
  accessId: string;
  requestId: string;
  clip: ClipMetadata;
  facility?: string;
  court?: string;
}): PBVisionSubmitMetadata {
  const gameStartEpoch =
    epochSecondsFromIso(clip.recorded_at) ?? epochSecondsFromIso(clip.created_at);

  return {
    userEmails: [email],
    name: clip.title || clip.slug || undefined,
    gameStartEpoch,
    facility,
    court,
    desc: `ReplayTrove PlayerTrove access ${accessId} · request ${requestId}`,
  };
}

async function loadPbVisionRequest(requestId: string): Promise<PbVisionRequestRow | null> {
  const { data, error } = await supabaseAdmin
    .from('pb_vision_requests')
    .select(
      'id, player_video_access_id, email, clip_id, status, submission_attempt_count, refund_status, stripe_refund_id, notes'
    )
    .eq('id', requestId)
    .maybeSingle();

  if (error) {
    console.error('[PB Vision] Failed to load request', {
      request_id: requestId,
      error: error.message,
    });
    return null;
  }

  return (data as PbVisionRequestRow | null) ?? null;
}

async function loadAccessForRequest(accessId: string): Promise<AccessRow | null> {
  const { data, error } = await supabaseAdmin
    .from('player_video_access')
    .select(
      'id, clip_id, email, access_status, pb_vision_purchased_at, pb_vision_expires_at'
    )
    .eq('id', accessId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as AccessRow;
}

function isPbVisionExpired(pbVisionExpiresAt: string | null) {
  if (!pbVisionExpiresAt) return true;
  return new Date() > new Date(pbVisionExpiresAt);
}

function refundCompleted(refundStatus: string | null) {
  return refundStatus === 'completed' || refundStatus === 'skipped_free';
}

export async function refundPbVisionAfterFailedDelivery(
  requestId: string,
  errorReason?: string | null
) {
  const request = await loadPbVisionRequest(requestId);
  if (!request || refundCompleted(request.refund_status)) {
    return;
  }

  const now = new Date().toISOString();

  if (request.refund_status !== 'pending') {
    await supabaseAdmin
      .from('pb_vision_requests')
      .update({
        refund_status: 'pending',
        auto_retry_exhausted_at: now,
        updated_at: now,
      })
      .eq('id', requestId);
  }

  const clip = await fetchClipMetadata(request.clip_id);
  const clipLabel = clip?.title || clip?.slug || 'your clip';

  const { data: lineItemRows, error: lineItemError } = await supabaseAdmin
    .from('order_line_items')
    .select(
      'id, unit_amount_cents, stripe_checkout_session_id, clip_id, created_at'
    )
    .eq('clip_id', request.clip_id)
    .eq('product_type', 'pb_vision')
    .order('created_at', { ascending: false });

  if (lineItemError) {
    console.error('[PB Vision Refund] Failed to load line items', {
      request_id: requestId,
      error: lineItemError.message,
    });
  }

  const normalizedEmail = request.email.toLowerCase().trim();
  let matchedLineItem: {
    unit_amount_cents: number;
    stripe_checkout_session_id: string;
  } | null = null;
  let paymentIntentId: string | null = null;

  for (const lineItem of lineItemRows ?? []) {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('stripe_payment_intent_id, email, status')
      .eq('stripe_checkout_session_id', lineItem.stripe_checkout_session_id)
      .eq('clip_id', request.clip_id)
      .maybeSingle();

    if (
      order?.status === 'paid' &&
      (order.email ?? '').toLowerCase().trim() === normalizedEmail
    ) {
      matchedLineItem = {
        unit_amount_cents: lineItem.unit_amount_cents,
        stripe_checkout_session_id: lineItem.stripe_checkout_session_id,
      };
      paymentIntentId = order.stripe_payment_intent_id ?? null;
      break;
    }
  }

  let refundStatus: 'completed' | 'skipped_free' | 'failed' | 'not_applicable' =
    'not_applicable';
  let stripeRefundId: string | null = null;
  let refundAmountCents = 0;

  if (!matchedLineItem) {
    console.warn('[PB Vision Refund] No paid PB Vision line item found', {
      request_id: requestId,
      clip_id: request.clip_id,
      email: normalizedEmail,
    });
    refundStatus = 'not_applicable';
  } else if (matchedLineItem.unit_amount_cents <= 0) {
    refundStatus = 'skipped_free';
  } else if (!paymentIntentId) {
    console.error('[PB Vision Refund] Missing payment intent', {
      request_id: requestId,
      session_id: matchedLineItem.stripe_checkout_session_id,
    });
    refundStatus = 'failed';
  } else {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: matchedLineItem.unit_amount_cents,
        reason: 'requested_by_customer',
        metadata: {
          pb_vision_request_id: requestId,
          clip_id: request.clip_id,
          reason: 'pb_vision_delivery_failed',
        },
      });
      stripeRefundId = refund.id;
      refundAmountCents = matchedLineItem.unit_amount_cents;
      refundStatus = 'completed';
    } catch (refundError) {
      console.error('[PB Vision Refund] Stripe refund failed', {
        request_id: requestId,
        payment_intent: paymentIntentId,
        error:
          refundError instanceof Error ? refundError.message : refundError,
      });
      refundStatus = 'failed';
    }
  }

  const refundedAt = new Date().toISOString();

  await supabaseAdmin
    .from('player_video_access')
    .update({
      pb_vision_purchased_at: null,
      pb_vision_expires_at: null,
      updated_at: refundedAt,
    })
    .eq('id', request.player_video_access_id);

  await supabaseAdmin
    .from('pb_vision_requests')
    .update({
      refund_status: refundStatus,
      stripe_refund_id: stripeRefundId,
      refunded_at: refundedAt,
      auto_retry_exhausted_at: refundedAt,
      status: 'failed',
      updated_at: refundedAt,
    })
    .eq('id', requestId);

  try {
    await sendPbVisionRefundEmail({
      email: normalizedEmail,
      clipLabel,
      refundAmountCents,
      refundStatus,
      errorReason: errorReason ?? null,
    });
  } catch (emailError) {
    console.error('[PB Vision Refund] Refund email failed', {
      request_id: requestId,
      error: emailError instanceof Error ? emailError.message : emailError,
    });
  }

  console.log('[PB Vision Refund] Delivery failure handled', {
    request_id: requestId,
    refund_status: refundStatus,
    stripe_refund_id: stripeRefundId,
    refund_amount_cents: refundAmountCents,
  });
}

export async function handlePbVisionDeliveryFailure(
  requestId: string,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();

  await supabaseAdmin
    .from('pb_vision_requests')
    .update({
      status: 'failed',
      error_reason: reason,
      updated_at: now,
    })
    .eq('id', requestId);

  await processPbVisionFailureAfterDeliveryError(requestId, reason);
}

export async function processPbVisionFailureAfterDeliveryError(
  requestId: string,
  reason: string
): Promise<void> {
  const request = await loadPbVisionRequest(requestId);
  if (!request || refundCompleted(request.refund_status)) {
    return;
  }

  if (request.submission_attempt_count >= MAX_PB_VISION_SUBMISSION_ATTEMPTS) {
    await refundPbVisionAfterFailedDelivery(requestId, reason);
    return;
  }

  const retryResult = await runPbVisionSubmissionAttempt({
    requestId,
    source: 'auto_retry',
  });

  if (!retryResult.ok && retryResult.exhausted) {
    await refundPbVisionAfterFailedDelivery(requestId, reason);
  }
}

export type PbVisionSubmissionAttemptResult =
  | {
      ok: true;
      request_id: string;
      status: string;
      pbv_vid: string | null;
      pbv_webpage_url: string | null;
    }
  | { ok: false; status: number; error: string; exhausted?: boolean };

export async function runPbVisionSubmissionAttempt({
  requestId,
  viewerEmail,
  notes,
  source = 'user',
}: {
  requestId: string;
  viewerEmail?: string;
  notes?: string | null;
  source?: 'user' | 'auto_retry';
}): Promise<PbVisionSubmissionAttemptResult> {
  const request = await loadPbVisionRequest(requestId);
  if (!request) {
    return { ok: false, status: 404, error: 'PB Vision request not found' };
  }

  if (refundCompleted(request.refund_status)) {
    return {
      ok: false,
      status: 410,
      error:
        'PB Vision analysis could not be delivered. Your purchase has been refunded.',
      exhausted: true,
    };
  }

  if (request.status === 'completed') {
    return {
      ok: true,
      request_id: request.id,
      status: 'completed',
      pbv_vid: null,
      pbv_webpage_url: null,
    };
  }

  if (request.status === 'submitted' && source === 'user') {
    return {
      ok: true,
      request_id: request.id,
      status: 'submitted',
      pbv_vid: null,
      pbv_webpage_url: null,
    };
  }

  const access = await loadAccessForRequest(request.player_video_access_id);
  if (!access) {
    return { ok: false, status: 404, error: 'Access record not found' };
  }

  const accessEmail = (access.email ?? '').toLowerCase().trim();

  if (viewerEmail && accessEmail !== viewerEmail.toLowerCase().trim()) {
    return { ok: false, status: 403, error: 'You do not have access to this clip' };
  }

  if (access.access_status !== 'active') {
    return { ok: false, status: 403, error: 'You do not have access to this clip' };
  }

  if (!hasPbVisionPurchaseAccess(access)) {
    return {
      ok: false,
      status: 403,
      error: 'PB Vision analysis has not been purchased for this clip',
    };
  }

  if (isPbVisionExpired(access.pb_vision_expires_at)) {
    return {
      ok: false,
      status: 403,
      error: 'Your PB Vision access has expired for this clip',
    };
  }

  if (request.submission_attempt_count >= MAX_PB_VISION_SUBMISSION_ATTEMPTS) {
    await refundPbVisionAfterFailedDelivery(requestId);
    return {
      ok: false,
      status: 503,
      error:
        'PB Vision analysis could not be completed after multiple attempts. A refund has been issued.',
      exhausted: true,
    };
  }

  const attemptNumber = request.submission_attempt_count + 1;
  const attemptStartedAt = new Date().toISOString();

  await supabaseAdmin
    .from('pb_vision_requests')
    .update({
      submission_attempt_count: attemptNumber,
      last_retry_at: attemptStartedAt,
      status: 'requested',
      error_reason: null,
      updated_at: attemptStartedAt,
      notes: notes?.trim() || request.notes,
    })
    .eq('id', requestId);

  const hdResolved = await resolveHdDownloadByAccessId(
    access.id,
    source === 'auto_retry'
      ? '/internal/pb-vision/auto-retry'
      : '/api/player-trove/pb-vision/request',
    accessEmail
  );

  if (!hdResolved.ok) {
    await handlePbVisionDeliveryFailure(requestId, hdResolved.error);
    return {
      ok: false,
      status: hdResolved.status,
      error: hdResolved.error,
      exhausted: attemptNumber >= MAX_PB_VISION_SUBMISSION_ATTEMPTS,
    };
  }

  const { s3Key } = hdResolved.download;

  if (!s3Key.toLowerCase().endsWith('.mp4')) {
    const message = 'Video file must be an MP4 for PB Vision analysis';
    await handlePbVisionDeliveryFailure(requestId, message);
    return {
      ok: false,
      status: 400,
      error: message,
      exhausted: attemptNumber >= MAX_PB_VISION_SUBMISSION_ATTEMPTS,
    };
  }

  const clip = await fetchClipMetadata(access.clip_id);
  if (!clip) {
    const message = 'Clip not found';
    await handlePbVisionDeliveryFailure(requestId, message);
    return { ok: false, status: 404, error: message };
  }

  const { facility, court } = await fetchClubCourtNames(access.clip_id);
  const metadata = buildPbVisionMetadata({
    email: accessEmail,
    accessId: access.id,
    requestId,
    clip,
    facility,
    court,
  });

  let signedUrl: string;
  try {
    signedUrl = await createSignedMp4FetchUrl(s3Key);
  } catch (signError) {
    const message = 'Failed to prepare video for PB Vision';
    console.error('[PB Vision] Signed URL generation failed', {
      request_id: requestId,
      attempt: attemptNumber,
      source,
      error: signError instanceof Error ? signError.message : signError,
    });
    await handlePbVisionDeliveryFailure(requestId, message);
    return {
      ok: false,
      status: 500,
      error: message,
      exhausted: attemptNumber >= MAX_PB_VISION_SUBMISSION_ATTEMPTS,
    };
  }

  let pbvVid: string;
  try {
    const submitted = await submitVideoUrlToPBVision({
      videoUrl: signedUrl,
      metadata,
    });
    pbvVid = submitted.vid;
  } catch (submitError) {
    const reason =
      submitError instanceof Error ? submitError.message : 'PB Vision submission failed';

    console.error('[PB Vision] Submission failed', {
      request_id: requestId,
      attempt: attemptNumber,
      source,
      s3_key: s3Key,
      error: reason,
    });

    await handlePbVisionDeliveryFailure(requestId, reason);

    const refreshed = await loadPbVisionRequest(requestId);
    const exhausted =
      (refreshed?.submission_attempt_count ?? attemptNumber) >=
        MAX_PB_VISION_SUBMISSION_ATTEMPTS ||
      refundCompleted(refreshed?.refund_status ?? null);

    return {
      ok: false,
      status: 502,
      error: exhausted
        ? 'PB Vision analysis could not be completed after multiple attempts. A refund has been issued.'
        : reason,
      exhausted,
    };
  }

  const submittedAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from('pb_vision_requests')
    .update({
      status: 'submitted',
      source_s3_key: s3Key,
      pbv_vid: pbvVid,
      submitted_at: submittedAt,
      error_reason: null,
      updated_at: submittedAt,
    })
    .eq('id', requestId);

  if (updateError) {
    console.error('[PB Vision] Failed to update request after submit', {
      request_id: requestId,
      pbv_vid: pbvVid,
      error: updateError.message,
    });
    return { ok: false, status: 500, error: 'Failed to save PB Vision request' };
  }

  console.log('[PB Vision] Video submitted', {
    request_id: requestId,
    attempt: attemptNumber,
    source,
    clip_id: access.clip_id,
    pbv_vid: pbvVid,
    s3_key: s3Key,
  });

  return {
    ok: true,
    request_id: requestId,
    status: 'submitted',
    pbv_vid: pbvVid,
    pbv_webpage_url: null,
  };
}
