import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  loadPaidPbVisionPurchasesForClips,
  repairMissingPbVisionEntitlement,
} from '@/lib/commerce/pb-vision-entitlements';
import { autoSubmitPbVisionAfterPurchase } from '@/lib/pb-vision-request';
import { resetPbVisionRequestAfterRepurchase } from '@/lib/pb-vision-retry-refund';

export async function adminResetPbVisionRequestForRetry(requestId: string) {
  const { data: request, error } = await supabaseAdmin
    .from('pb_vision_requests')
    .select('id, player_video_access_id, email, clip_id')
    .eq('id', requestId)
    .maybeSingle();

  if (error || !request) {
    return { ok: false as const, status: 404, error: 'PB Vision request not found' };
  }

  const resetOk = await resetPbVisionRequestAfterRepurchase(
    request.player_video_access_id
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

  const submitResult = await autoSubmitPbVisionAfterPurchase({
    accessId: request.player_video_access_id,
    email: request.email,
  });

  if (!submitResult.ok) {
    return {
      ok: false as const,
      status: submitResult.status,
      error: submitResult.error,
    };
  }

  return {
    ok: true as const,
    request_id: submitResult.request_id,
    status: submitResult.status,
    pbv_vid: submitResult.pbv_vid,
  };
}
