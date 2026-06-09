import {
  isProductType,
  resolveBaseProductForClip,
  type ProductType,
} from '@/lib/commerce/products';

export const CART_PAYLOAD_VERSION = 2;

export type CartLineSelection = {
  clipId: string;
  products: ProductType[];
};

export type CartPayload = {
  version: typeof CART_PAYLOAD_VERSION;
  bookingId: string;
  sessionBundle: boolean;
  lines: CartLineSelection[];
};

export type SessionClipPricingClient = {
  id: string;
  baseProduct: 'clip_download' | 'full_game_hd';
  basePriceCents: number;
  pbVisionPriceCents: number;
  coachReviewPriceCents: number;
  isFullGame: boolean;
  duration_seconds: number | null;
};

export type SessionBundleQuoteClient = {
  showBundle: boolean;
  billedHours: number;
  hourlyRateCents: number;
  bundlePriceCents: number;
  individualSumCents: number;
  savingsCents: number;
  eligibleClipIds: string[];
};

export function emptyCartPayload(bookingId: string): CartPayload {
  return {
    version: CART_PAYLOAD_VERSION,
    bookingId,
    sessionBundle: false,
    lines: [],
  };
}

function dedupeProducts(products: ProductType[]) {
  return [...new Set(products)];
}

export function getCartLine(cart: CartPayload, clipId: string) {
  return cart.lines.find((line) => line.clipId === clipId);
}

export function clipHasProduct(
  cart: CartPayload,
  clipId: string,
  product: ProductType
) {
  const line = getCartLine(cart, clipId);
  return line?.products.includes(product) ?? false;
}

export function isClipInCart(cart: CartPayload, clipId: string) {
  const line = getCartLine(cart, clipId);
  return Boolean(line && line.products.length > 0);
}

export function setClipProducts(
  cart: CartPayload,
  clipId: string,
  products: ProductType[]
): CartPayload {
  const normalized = dedupeProducts(products);
  const withoutClip = cart.lines.filter((line) => line.clipId !== clipId);

  if (normalized.length === 0) {
    return { ...cart, lines: withoutClip };
  }

  return {
    ...cart,
    lines: [...withoutClip, { clipId, products: normalized }],
  };
}

export function toggleShortClipInCart(
  cart: CartPayload,
  clipId: string
): CartPayload {
  if (isClipInCart(cart, clipId)) {
    return setClipProducts(cart, clipId, []);
  }

  return setClipProducts(cart, clipId, ['clip_download']);
}

export function toggleFullGameProduct(
  cart: CartPayload,
  clipId: string,
  product: ProductType,
  enabled: boolean
): CartPayload {
  const line = getCartLine(cart, clipId);
  const current = line?.products ?? [];

  if (product === 'full_game_hd' && !enabled) {
    return setClipProducts(
      cart,
      clipId,
      current.filter((p) => p !== 'pb_vision' && p !== 'coach_review')
    );
  }

  if (enabled) {
    if (product === 'pb_vision' || product === 'coach_review') {
      const hdOk = cart.sessionBundle || current.includes('full_game_hd');
      if (!hdOk) {
        return cart;
      }
    }

    return setClipProducts(cart, clipId, dedupeProducts([...current, product]));
  }

  return setClipProducts(
    cart,
    clipId,
    current.filter((p) => p !== product)
  );
}

export function setSessionBundle(cart: CartPayload, enabled: boolean): CartPayload {
  if (!enabled) {
    return { ...cart, sessionBundle: false };
  }

  const lines = cart.lines.map((line) => ({
    ...line,
    products: line.products.filter(
      (product) => product !== 'clip_download' && product !== 'full_game_hd'
    ),
  })).filter((line) => line.products.length > 0);

  return {
    ...cart,
    sessionBundle: true,
    lines,
  };
}

export function getProductPriceCents(
  clipPricing: SessionClipPricingClient,
  product: ProductType,
  bundleQuote: SessionBundleQuoteClient
) {
  switch (product) {
    case 'clip_download':
    case 'full_game_hd':
      return clipPricing.basePriceCents;
    case 'pb_vision':
      return clipPricing.pbVisionPriceCents;
    case 'coach_review':
      return clipPricing.coachReviewPriceCents;
    case 'session_bundle':
      return bundleQuote.bundlePriceCents;
    default:
      return 0;
  }
}

export function calculateCartTotalCents(
  cart: CartPayload,
  pricingByClipId: Map<string, SessionClipPricingClient>,
  bundleQuote: SessionBundleQuoteClient
) {
  let total = 0;

  if (cart.sessionBundle && bundleQuote.showBundle) {
    total += bundleQuote.bundlePriceCents;
  }

  for (const line of cart.lines) {
    const clipPricing = pricingByClipId.get(line.clipId);
    if (!clipPricing) {
      continue;
    }

    for (const product of line.products) {
      if (
        cart.sessionBundle &&
        (product === 'clip_download' || product === 'full_game_hd')
      ) {
        continue;
      }

      total += getProductPriceCents(clipPricing, product, bundleQuote);
    }
  }

  return total;
}

export function getCartClipIds(cart: CartPayload) {
  return [...new Set(cart.lines.map((line) => line.clipId))];
}

export function cartHasItems(cart: CartPayload) {
  return cart.sessionBundle || cart.lines.some((line) => line.products.length > 0);
}

export function migrateStoredCart(
  raw: unknown,
  clips: SessionClipPricingClient[],
  bookingId: string
): CartPayload {
  if (
    raw &&
    typeof raw === 'object' &&
    'version' in raw &&
    (raw as CartPayload).version === CART_PAYLOAD_VERSION
  ) {
    const cart = raw as CartPayload;
    return {
      version: CART_PAYLOAD_VERSION,
      bookingId,
      sessionBundle: Boolean(cart.sessionBundle),
      lines: (cart.lines ?? []).map((line) => ({
        clipId: line.clipId,
        products: (line.products ?? []).filter(isProductType),
      })),
    };
  }

  if (Array.isArray(raw)) {
    const clipIds = raw.filter((value): value is string => typeof value === 'string');
    const pricingById = new Map(clips.map((clip) => [clip.id, clip]));

    const lines = clipIds
      .map((clipId) => {
        const pricing = pricingById.get(clipId);
        const baseProduct = pricing
          ? pricing.baseProduct
          : resolveBaseProductForClip({ duration_seconds: null });

        return {
          clipId,
          products: [baseProduct as ProductType],
        };
      })
      .filter((line) => line.clipId);

    return {
      version: CART_PAYLOAD_VERSION,
      bookingId,
      sessionBundle: false,
      lines,
    };
  }

  return emptyCartPayload(bookingId);
}

export function addAllClipsBaseToCart(
  cart: CartPayload,
  clips: SessionClipPricingClient[]
): CartPayload {
  let next = setSessionBundle(cart, false);

  for (const clip of clips) {
    next = setClipProducts(next, clip.id, [clip.baseProduct as ProductType]);
  }

  return next;
}

export const PRODUCT_LABELS: Record<ProductType, string> = {
  clip_download: 'Clip Download',
  full_game_hd: 'HD Video',
  pb_vision: 'PB Vision Analysis',
  coach_review: 'Pro Review',
  session_bundle: 'Session Bundle',
};
