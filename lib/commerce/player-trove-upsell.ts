import {
  isProductType,
  resolveBaseProductForClip,
  type ProductType,
} from '@/lib/commerce/products';
import {
  CART_PAYLOAD_VERSION,
  PRODUCT_LABELS,
  type CartPayload,
} from '@/lib/commerce/cart-payload';
import {
  hasClipDownloadAccess,
  hasCoachReviewPurchaseAccess,
  hasHdDownloadAccess,
  hasPbVisionPurchaseAccess,
  hasVideoBaseAccess,
  type AccessEntitlementRow,
} from '@/lib/commerce/entitlements';
import {
  validateProductNotAlreadyPurchased,
  validateUpsellAddonRequirements,
} from '@/lib/commerce/purchase-validation';

export type UpsellProductStatus = 'purchased' | 'available' | 'requires_video';

export type UpsellOffer = {
  product: ProductType;
  label: string;
  priceCents: number;
  status: UpsellProductStatus;
};

export type UpsellPricing = {
  basePriceCents: number;
  pbVisionPriceCents: number;
  coachReviewPriceCents: number;
};

export function resolveUpsellOffers(
  access: AccessEntitlementRow,
  clip: { duration_seconds?: number | null },
  pricing: UpsellPricing
): UpsellOffer[] {
  const baseProduct = resolveBaseProductForClip(clip);
  const hasBase = hasVideoBaseAccess(access, clip);
  const offers: UpsellOffer[] = [];

  if (baseProduct === 'clip_download') {
    offers.push({
      product: 'clip_download',
      label: PRODUCT_LABELS.clip_download,
      priceCents: pricing.basePriceCents,
      status: hasClipDownloadAccess(access) ? 'purchased' : 'available',
    });
    return offers;
  }

  offers.push({
    product: 'full_game_hd',
    label: PRODUCT_LABELS.full_game_hd,
    priceCents: pricing.basePriceCents,
    status: hasHdDownloadAccess(access) ? 'purchased' : 'available',
  });

  for (const addon of ['pb_vision', 'coach_review'] as const) {
    const purchased =
      addon === 'pb_vision'
        ? hasPbVisionPurchaseAccess(access)
        : hasCoachReviewPurchaseAccess(access);

    const priceCents =
      addon === 'pb_vision'
        ? pricing.pbVisionPriceCents
        : pricing.coachReviewPriceCents;

    let status: UpsellProductStatus;
    if (purchased) {
      status = 'purchased';
    } else if (hasBase) {
      status = 'available';
    } else {
      status = 'requires_video';
    }

    offers.push({
      product: addon,
      label: PRODUCT_LABELS[addon],
      priceCents,
      status,
    });
  }

  return offers;
}

export function validateUpsellPurchaseRequest(
  access: AccessEntitlementRow,
  clip: { duration_seconds?: number | null },
  requestedProducts: ProductType[]
): { ok: true; products: ProductType[] } | { ok: false; error: string } {
  if (requestedProducts.length === 0) {
    return { ok: false, error: 'At least one product is required.' };
  }

  const uniqueProducts = [...new Set(requestedProducts)];

  if (uniqueProducts.length !== requestedProducts.length) {
    return { ok: false, error: 'Duplicate products in request.' };
  }

  for (const product of uniqueProducts) {
    if (!isProductType(product) || product === 'session_bundle') {
      return { ok: false, error: `Invalid product: ${product}` };
    }
  }

  for (const product of uniqueProducts) {
    const productCheck = validateProductNotAlreadyPurchased(access, clip, product);
    if (!productCheck.ok) {
      return productCheck;
    }
  }

  const addonCheck = validateUpsellAddonRequirements(access, clip, uniqueProducts);
  if (!addonCheck.ok) {
    return addonCheck;
  }

  return { ok: true, products: uniqueProducts };
}

export function buildUpsellCartPayload(
  clipId: string,
  bookingId: string | null,
  products: ProductType[]
): CartPayload {
  return {
    version: CART_PAYLOAD_VERSION,
    bookingId: bookingId ?? '',
    sessionBundle: false,
    lines: [{ clipId, products }],
  };
}

export function getUpsellStatusLabel(status: UpsellProductStatus) {
  switch (status) {
    case 'purchased':
      return 'Purchased';
    case 'available':
      return 'Available to purchase';
    case 'requires_video':
      return 'Requires video purchase';
  }
}
