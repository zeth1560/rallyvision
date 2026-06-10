import {
  resolveBaseProductForClip,
  type ClipDurationInput,
  type ProductType,
} from '@/lib/commerce/products';

export const ACCESS_WINDOW_DAYS = 30;

export type AccessEntitlementRow = {
  clip_download_purchased_at?: string | null;
  hd_download_purchased_at?: string | null;
  pb_vision_purchased_at?: string | null;
  coach_review_purchased_at?: string | null;
  download_expires_at?: string | null;
  pb_vision_expires_at?: string | null;
  coach_review_expires_at?: string | null;
};

function isExpiryActive(expiresAt: string | null | undefined) {
  if (!expiresAt) {
    return false;
  }

  return new Date() <= new Date(expiresAt);
}

function resolveEntitlementExpiry(
  purchasedAt: string | null | undefined,
  expiresAt: string | null | undefined
) {
  if (expiresAt) {
    return expiresAt;
  }

  if (!purchasedAt) {
    return null;
  }

  return computeAccessWindowExpiry(new Date(purchasedAt)).toISOString();
}

function hasActiveEntitlement(
  purchasedAt: string | null | undefined,
  expiresAt: string | null | undefined
) {
  if (!purchasedAt) {
    return false;
  }

  return isExpiryActive(resolveEntitlementExpiry(purchasedAt, expiresAt));
}

export function hasClipDownloadAccess(access: AccessEntitlementRow) {
  if (!access.clip_download_purchased_at) {
    return false;
  }

  return isExpiryActive(access.download_expires_at);
}

export function hasHdDownloadAccess(access: AccessEntitlementRow) {
  if (!access.hd_download_purchased_at) {
    return false;
  }

  return isExpiryActive(access.download_expires_at);
}

/**
 * True when the viewer has purchased the correct base product for this clip
 * (clip_download for replays, full_game_hd for full-game recordings).
 */
export function hasVideoBaseAccess(
  access: AccessEntitlementRow,
  clip: ClipDurationInput
) {
  const baseProduct = resolveBaseProductForClip(clip);

  if (baseProduct === 'full_game_hd') {
    return hasHdDownloadAccess(access);
  }

  return hasClipDownloadAccess(access);
}

function hasEverPurchasedBaseProduct(
  access: AccessEntitlementRow,
  clip: ClipDurationInput
) {
  const baseProduct = resolveBaseProductForClip(clip);

  if (baseProduct === 'full_game_hd') {
    return Boolean(access.hd_download_purchased_at);
  }

  return Boolean(access.clip_download_purchased_at);
}

export type BaseAccessDenialReason = 'never_purchased' | 'expired';

export function getVideoBaseAccessDenialReason(
  access: AccessEntitlementRow,
  clip: ClipDurationInput
): BaseAccessDenialReason | null {
  if (hasVideoBaseAccess(access, clip)) {
    return null;
  }

  if (!hasEverPurchasedBaseProduct(access, clip)) {
    return 'never_purchased';
  }

  return 'expired';
}

export function hasPbVisionPurchaseAccess(access: AccessEntitlementRow) {
  return hasActiveEntitlement(
    access.pb_vision_purchased_at,
    access.pb_vision_expires_at
  );
}

export function hasCoachReviewPurchaseAccess(access: AccessEntitlementRow) {
  return hasActiveEntitlement(
    access.coach_review_purchased_at,
    access.coach_review_expires_at
  );
}

export type PbVisionRequestPurchaseHint = {
  status: string;
  refund_status: string | null;
};

export function isPbVisionRequestRefunded(
  request: PbVisionRequestPurchaseHint | null | undefined
) {
  return (
    request?.refund_status === 'completed' ||
    request?.refund_status === 'skipped_free'
  );
}

export function hasPbVisionPurchaseViaRequest(
  request: PbVisionRequestPurchaseHint | null | undefined
) {
  if (!request) {
    return false;
  }

  if (isPbVisionRequestRefunded(request)) {
    return false;
  }

  return (
    request.status === 'requested' ||
    request.status === 'submitted' ||
    request.status === 'processing' ||
    request.status === 'completed' ||
    request.status === 'failed'
  );
}

export function computeAccessWindowExpiry(from: Date = new Date()) {
  return new Date(from.getTime() + ACCESS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export function computePurchaseWindowExpiry(
  clipCreatedAt: string | null | undefined,
  from: Date = new Date()
) {
  const base = clipCreatedAt ? new Date(clipCreatedAt) : from;
  return new Date(base.getTime() + ACCESS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export type EntitlementGrantPatch = {
  clip_download_purchased_at?: string;
  hd_download_purchased_at?: string;
  pb_vision_purchased_at?: string;
  coach_review_purchased_at?: string;
  download_expires_at?: string;
  pb_vision_expires_at?: string;
  coach_review_expires_at?: string;
  granted_via_session_bundle?: boolean;
};

export function buildEntitlementPatchForProduct(
  productType: ProductType,
  purchasedAt: string,
  options?: { grantedViaSessionBundle?: boolean }
): EntitlementGrantPatch {
  const expiresAt = computeAccessWindowExpiry(new Date(purchasedAt)).toISOString();
  const patch: EntitlementGrantPatch = {};

  switch (productType) {
    case 'clip_download':
      patch.clip_download_purchased_at = purchasedAt;
      patch.download_expires_at = expiresAt;
      break;
    case 'full_game_hd':
      patch.hd_download_purchased_at = purchasedAt;
      patch.download_expires_at = expiresAt;
      break;
    case 'pb_vision':
      patch.pb_vision_purchased_at = purchasedAt;
      patch.pb_vision_expires_at = expiresAt;
      break;
    case 'coach_review':
      patch.coach_review_purchased_at = purchasedAt;
      patch.coach_review_expires_at = expiresAt;
      break;
    case 'session_bundle':
      break;
  }

  if (options?.grantedViaSessionBundle) {
    patch.granted_via_session_bundle = true;
  }

  return patch;
}

export function mergeEntitlementPatches(
  ...patches: EntitlementGrantPatch[]
): EntitlementGrantPatch {
  return patches.reduce<EntitlementGrantPatch>((merged, patch) => {
    return {
      ...merged,
      ...patch,
      granted_via_session_bundle:
        merged.granted_via_session_bundle || patch.granted_via_session_bundle,
    };
  }, {});
}

export function logEntitlementGrant(context: Record<string, unknown>) {
  console.log('[Entitlements] Grant', {
    ...context,
    timestamp: new Date().toISOString(),
  });
}
