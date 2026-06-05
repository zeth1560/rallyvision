import {
  addonRequiresFullGameHd,
  isAddonProduct,
  isProductType,
  resolveBaseProductForClip,
  type ProductType,
} from '@/lib/commerce/products';
import {
  hasClipDownloadAccess,
  hasCoachReviewPurchaseAccess,
  hasHdDownloadAccess,
  hasPbVisionPurchaseAccess,
  hasVideoBaseAccess,
  type AccessEntitlementRow,
} from '@/lib/commerce/entitlements';
import {
  getBillableNormalizedLines,
  type ClipCartContext,
  type NormalizedCheckoutCart,
} from '@/lib/commerce/cart-normalize';

export class PurchaseValidationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PurchaseValidationError';
    this.code = code;
  }
}

export function normalizeCheckoutEmail(
  email: string | null | undefined
): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

export function validateProductNotAlreadyPurchased(
  access: AccessEntitlementRow,
  clip: { duration_seconds?: number | null },
  product: ProductType
): { ok: true } | { ok: false; error: string } {
  if (!isProductType(product) || product === 'session_bundle') {
    return { ok: false, error: `Invalid product: ${product}` };
  }

  const baseProduct = resolveBaseProductForClip(clip);

  if (baseProduct === 'clip_download') {
    if (product !== 'clip_download') {
      return {
        ok: false,
        error: 'Short clips only support clip download purchases.',
      };
    }

    if (hasClipDownloadAccess(access)) {
      return { ok: false, error: 'Clip download is already purchased.' };
    }

    return { ok: true };
  }

  if (product === 'clip_download') {
    return {
      ok: false,
      error: 'Clip download is not available for full-game recordings.',
    };
  }

  if (product === 'full_game_hd') {
    if (hasHdDownloadAccess(access)) {
      return { ok: false, error: 'HD video is already purchased.' };
    }

    return { ok: true };
  }

  if (product === 'pb_vision' && hasPbVisionPurchaseAccess(access)) {
    return { ok: false, error: 'PB Vision is already purchased.' };
  }

  if (product === 'coach_review' && hasCoachReviewPurchaseAccess(access)) {
    return { ok: false, error: 'Coach Review is already purchased.' };
  }

  return { ok: true };
}

export function validateUpsellAddonRequirements(
  access: AccessEntitlementRow,
  clip: { duration_seconds?: number | null },
  requestedProducts: ProductType[]
): { ok: true } | { ok: false; error: string } {
  const baseProduct = resolveBaseProductForClip(clip);
  const hasBase = hasVideoBaseAccess(access, clip);
  const purchasingHd = requestedProducts.includes('full_game_hd');

  for (const product of requestedProducts) {
    if (!isAddonProduct(product)) {
      continue;
    }

    if (!hasBase && !purchasingHd) {
      return {
        ok: false,
        error: 'PB Vision and Coach Review require HD video access.',
      };
    }
  }

  if (baseProduct === 'full_game_hd') {
    const hasOnlyAddons = requestedProducts.every((product) =>
      addonRequiresFullGameHd(product)
    );

    if (hasOnlyAddons && !hasBase && !purchasingHd) {
      return {
        ok: false,
        error: 'Add-on products require HD video access.',
      };
    }
  }

  return { ok: true };
}

type AccessLookupRow = AccessEntitlementRow & {
  clip_id: string;
  access_status?: string | null;
  granted_via_session_bundle?: boolean | null;
};

export async function loadActiveAccessByEmailAndClips(
  email: string,
  clipIds: string[]
): Promise<Map<string, AccessLookupRow>> {
  if (clipIds.length === 0) {
    return new Map();
  }

  const { supabaseAdmin } = await import('@/lib/supabase-admin');
  const { data, error } = await supabaseAdmin
    .from('player_video_access')
    .select(
      `
      clip_id,
      access_status,
      granted_via_session_bundle,
      clip_download_purchased_at,
      hd_download_purchased_at,
      pb_vision_purchased_at,
      coach_review_purchased_at,
      download_expires_at,
      pb_vision_expires_at,
      coach_review_expires_at
    `
    )
    .eq('email', email)
    .in('clip_id', clipIds)
    .eq('access_status', 'active')
    .order('purchased_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load access records: ${error.message}`);
  }

  const byClipId = new Map<string, AccessLookupRow>();

  for (const row of (data ?? []) as AccessLookupRow[]) {
    if (!byClipId.has(row.clip_id)) {
      byClipId.set(row.clip_id, row);
    }
  }

  return byClipId;
}

export async function hasActiveSessionBundleForBooking(
  email: string,
  bookingId: string,
  sessionClips: ClipCartContext[]
): Promise<boolean> {
  if (sessionClips.length === 0) {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');
    const { data: clips, error: clipsError } = await supabaseAdmin
      .from('clips')
      .select('id, duration_seconds')
      .eq('booking_id', bookingId)
      .eq('published', true);

    if (clipsError) {
      throw new Error(`Failed to load session clips: ${clipsError.message}`);
    }

    sessionClips = (clips ?? []) as ClipCartContext[];
  }

  if (sessionClips.length === 0) {
    return false;
  }

  const accessByClipId = await loadActiveAccessByEmailAndClips(
    email,
    sessionClips.map((clip) => clip.id)
  );

  for (const clip of sessionClips) {
    const access = accessByClipId.get(clip.id);
    if (!access) {
      continue;
    }

    if (access.granted_via_session_bundle && hasVideoBaseAccess(access, clip)) {
      return true;
    }
  }

  return false;
}

export async function validateNormalizedCartPurchases({
  email,
  normalized,
  clipsById,
}: {
  email: string;
  normalized: NormalizedCheckoutCart;
  clipsById: Map<string, ClipCartContext & { duration_seconds?: number | null }>;
}): Promise<void> {
  const normalizedEmail = normalizeCheckoutEmail(email);

  if (!normalizedEmail) {
    throw new PurchaseValidationError(
      'CHECKOUT_EMAIL_REQUIRED',
      'An email address is required to complete checkout.'
    );
  }

  if (normalized.sessionBundle && normalized.bookingId) {
    const sessionClips = [...clipsById.values()].filter(
      (clip) => clip.booking_id === normalized.bookingId
    );

    const hasActiveBundle = await hasActiveSessionBundleForBooking(
      normalizedEmail,
      normalized.bookingId,
      sessionClips
    );

    if (hasActiveBundle) {
      throw new PurchaseValidationError(
        'SESSION_BUNDLE_ALREADY_PURCHASED',
        'You already have an active session bundle for this booking.'
      );
    }
  }

  const billableLines = getBillableNormalizedLines(normalized);
  const clipIds = [...new Set(billableLines.map((line) => line.clipId))];
  const accessByClipId = await loadActiveAccessByEmailAndClips(
    normalizedEmail,
    clipIds
  );

  for (const line of billableLines) {
    const clip = clipsById.get(line.clipId);
    if (!clip) {
      continue;
    }

    const access = accessByClipId.get(line.clipId) ?? {};
    const productCheck = validateProductNotAlreadyPurchased(
      access,
      clip,
      line.productType
    );

    if (!productCheck.ok) {
      throw new PurchaseValidationError(
        'PRODUCT_ALREADY_PURCHASED',
        productCheck.error
      );
    }

    const addonCheck = validateUpsellAddonRequirements(access, clip, [
      line.productType,
    ]);

    if (!addonCheck.ok) {
      throw new PurchaseValidationError(
        'PRODUCT_REQUIRES_BASE',
        addonCheck.error
      );
    }
  }
}

export async function validateFreeCheckoutEntitlements({
  email,
  clips,
}: {
  email: string;
  clips: Array<ClipCartContext & { duration_seconds?: number | null }>;
}): Promise<void> {
  const normalizedEmail = normalizeCheckoutEmail(email);

  if (!normalizedEmail) {
    throw new PurchaseValidationError(
      'CHECKOUT_EMAIL_REQUIRED',
      'Email is required.'
    );
  }

  const accessByClipId = await loadActiveAccessByEmailAndClips(
    normalizedEmail,
    clips.map((clip) => clip.id)
  );

  for (const clip of clips) {
    const access = accessByClipId.get(clip.id);
    if (!access) {
      continue;
    }

    if (hasVideoBaseAccess(access, clip)) {
      throw new PurchaseValidationError(
        'PRODUCT_ALREADY_PURCHASED',
        'You already have active access to one or more clips in this request.'
      );
    }
  }
}
