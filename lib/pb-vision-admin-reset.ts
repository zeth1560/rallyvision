import {
  loadPaidPbVisionPurchasesForClips,
  repairMissingPbVisionEntitlement,
} from '@/lib/commerce/pb-vision-entitlements';
import {
  markPbVisionSubmissionFailed,
  resetPbVisionRequestAfterRepurchase,
  runPbVisionSubmissionAttempt,
} from '@/lib/pb-vision-retry-refund';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function adminPreparePbVisionRequestForRetry(requestId: string) {
  const { data: request, error } = await supabaseAdmin
    .from('pb_vision_requests')
    .select('id, player_video_access_id, email, clip_id')
    .eq('id', requestId)
    .maybeSingle();

  if (error || !request) {
    return { ok: false as const, status: 404, error: 'PB Vision request not found' };
  }

  const resetOk = await resetPbVisionRequestAfterRepurchase(
    request.player_video_access_id,
    { status: 'processing' }
  );
  if (!resetOk) {
    return {
      ok: false as const,
      status: 500,
      error: 'Failed to reset PB Vision request',
    };
  }

  const purchases = await loadPaidPbVisionPurchasesForClips(request.email, [
    request.clip_id,
  ]);
  const purchase = purchases.get(request.clip_id);

  if (purchase) {
    await repairMissingPbVisionEntitlement(request.player_video_access_id, purchase);
  }

  return {
    ok: true as const,
    request_id: request.id,
  };
}

export async function adminSubmitPbVisionRequestSafely(requestId: string) {
  try {
    const submitResult = await runPbVisionSubmissionAttempt({
      requestId,
      source: 'admin_retry',
    });

    if (!submitResult.ok) {
      console.error('[PB Vision Admin Submit] Failed', {
        request_id: requestId,
        status: submitResult.status,
        error: submitResult.error,
      });
      return submitResult;
    }

    console.log('[PB Vision Admin Submit] Succeeded', {
      request_id: requestId,
      pbv_vid: submitResult.pbv_vid,
      status: submitResult.status,
    });

    return submitResult;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'PB Vision submission failed unexpectedly';

    console.error('[PB Vision Admin Submit] Uncaught error', {
      request_id: requestId,
      error: message,
    });

    await markPbVisionSubmissionFailed(requestId, message);

    return {
      ok: false as const,
      status: 500,
      error: message,
    };
  }
}

export async function adminRetryPbVisionRequest(requestId: string) {
  const prepared = await adminPreparePbVisionRequestForRetry(requestId);
  if (!prepared.ok) {
    return prepared;
  }

  return adminSubmitPbVisionRequestSafely(requestId);
}

export async function adminResetPbVisionRequestForRetry(requestId: string) {
  return adminRetryPbVisionRequest(requestId);
}
