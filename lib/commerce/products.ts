export const FULL_GAME_MIN_DURATION_SECONDS = 300;

/** Customer-facing Coach Review / Pro Review purchase and actions. */
export const COACH_REVIEW_CUSTOMER_ENABLED = true;

/** Pro Review add-on checkbox on session checkout pages. */
export const SESSION_COACH_REVIEW_ADDON_ENABLED = false;

/** Customer-facing YouTube upload / view actions. */
export const YOUTUBE_CUSTOMER_ENABLED = false;

export const PRODUCT_TYPES = [
  'clip_download',
  'full_game_hd',
  'pb_vision',
  'coach_review',
  'session_bundle',
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

export type BaseProductType = 'clip_download' | 'full_game_hd';

export type ClipDurationInput = {
  duration_seconds?: number | null;
};

export function isProductType(value: string): value is ProductType {
  return (PRODUCT_TYPES as readonly string[]).includes(value);
}

export function resolveBaseProductForClip(
  clip: ClipDurationInput
): BaseProductType {
  if (
    clip.duration_seconds != null &&
    clip.duration_seconds >= FULL_GAME_MIN_DURATION_SECONDS
  ) {
    return 'full_game_hd';
  }

  return 'clip_download';
}

export function isFullGameClip(clip: ClipDurationInput) {
  return resolveBaseProductForClip(clip) === 'full_game_hd';
}

export const ADDON_PRODUCT_TYPES = ['pb_vision', 'coach_review'] as const;

export type AddonProductType = (typeof ADDON_PRODUCT_TYPES)[number];

export function isAddonProduct(product: ProductType): product is AddonProductType {
  return product === 'pb_vision' || product === 'coach_review';
}

export function addonRequiresFullGameHd(product: ProductType) {
  return isAddonProduct(product);
}
