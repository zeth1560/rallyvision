import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  buildEntitlementPatchForProduct,
  hasPbVisionPurchaseAccess,
  isPbVisionRequestRefunded,
  type AccessEntitlementRow,
  type PbVisionRequestPurchaseHint,
} from '@/lib/commerce/entitlements';

export type PaidPbVisionPurchase = {
  purchasedAt: string;
  stripeCheckoutSessionId: string;
};

export async function loadPaidPbVisionPurchasesForClips(
  email: string,
  clipIds: string[]
): Promise<Map<string, PaidPbVisionPurchase>> {
  if (clipIds.length === 0) {
    return new Map();
  }

  const normalizedEmail = email.toLowerCase().trim();

  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('clip_id, stripe_checkout_session_id')
    .ilike('email', normalizedEmail)
    .eq('status', 'paid')
    .in('clip_id', clipIds);

  if (ordersError) {
    throw new Error(`Failed to load PB Vision orders: ${ordersError.message}`);
  }

  const paidSessionIds = [
    ...new Set(
      (orders ?? [])
        .map((order) => order.stripe_checkout_session_id)
        .filter(Boolean)
    ),
  ] as string[];

  if (paidSessionIds.length === 0) {
    return new Map();
  }

  const { data: lineItems, error: lineItemsError } = await supabaseAdmin
    .from('order_line_items')
    .select('clip_id, created_at, stripe_checkout_session_id')
    .eq('product_type', 'pb_vision')
    .in('clip_id', clipIds)
    .in('stripe_checkout_session_id', paidSessionIds);

  if (lineItemsError) {
    throw new Error(
      `Failed to load PB Vision order line items: ${lineItemsError.message}`
    );
  }

  const purchasesByClipId = new Map<string, PaidPbVisionPurchase>();

  for (const lineItem of lineItems ?? []) {
    if (!lineItem.clip_id || !lineItem.created_at) {
      continue;
    }

    const existing = purchasesByClipId.get(lineItem.clip_id);
    if (
      !existing ||
      new Date(lineItem.created_at).getTime() >
        new Date(existing.purchasedAt).getTime()
    ) {
      purchasesByClipId.set(lineItem.clip_id, {
        purchasedAt: lineItem.created_at,
        stripeCheckoutSessionId: lineItem.stripe_checkout_session_id,
      });
    }
  }

  return purchasesByClipId;
}

export function applyPaidPbVisionPurchaseToAccessRow<
  T extends AccessEntitlementRow,
>(access: T, purchase: PaidPbVisionPurchase): T {
  if (hasPbVisionPurchaseAccess(access)) {
    return access;
  }

  const patch = buildEntitlementPatchForProduct('pb_vision', purchase.purchasedAt);

  return {
    ...access,
    pb_vision_purchased_at: patch.pb_vision_purchased_at ?? access.pb_vision_purchased_at,
    pb_vision_expires_at: patch.pb_vision_expires_at ?? access.pb_vision_expires_at,
  };
}

export function shouldRepairPbVisionEntitlementFromOrder(
  access: AccessEntitlementRow,
  purchase: PaidPbVisionPurchase | undefined,
  pbVisionRequest: PbVisionRequestPurchaseHint | null | undefined
) {
  if (!purchase || hasPbVisionPurchaseAccess(access)) {
    return false;
  }

  return !isPbVisionRequestRefunded(pbVisionRequest);
}

export async function repairMissingPbVisionEntitlement(
  accessId: string,
  purchase: PaidPbVisionPurchase
) {
  const patch = buildEntitlementPatchForProduct('pb_vision', purchase.purchasedAt);
  const updatedAt = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('player_video_access')
    .update({
      ...patch,
      updated_at: updatedAt,
    })
    .eq('id', accessId);

  if (error) {
    console.error('[PB Vision Entitlements] Failed to repair access row', {
      access_id: accessId,
      stripe_checkout_session_id: purchase.stripeCheckoutSessionId,
      error: error.message,
    });
    return false;
  }

  console.log('[PB Vision Entitlements] Repaired missing access entitlement', {
    access_id: accessId,
    stripe_checkout_session_id: purchase.stripeCheckoutSessionId,
    purchased_at: patch.pb_vision_purchased_at,
  });

  return true;
}

export async function clearPbVisionEntitlement(accessId: string) {
  const updatedAt = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from('player_video_access')
    .update({
      pb_vision_purchased_at: null,
      pb_vision_expires_at: null,
      updated_at: updatedAt,
    })
    .eq('id', accessId);

  if (error) {
    console.error('[PB Vision Entitlements] Failed to clear access entitlement', {
      access_id: accessId,
      error: error.message,
    });
    return false;
  }

  return true;
}
