import {
  addonRequiresFullGameHd,
  isProductType,
  resolveBaseProductForClip,
  type ProductType,
} from '@/lib/commerce/products';

export type CartLineInput = {
  clipId: string;
  products: ProductType[];
};

export type ParsedCheckoutCart = {
  version: 0 | 1;
  bookingId: string | null;
  sessionBundle: boolean;
  lines: CartLineInput[];
  legacyClipIds: string[];
  source: 'cartJson' | 'legacy_clipIds';
};

export type ClipCartContext = {
  id: string;
  booking_id: string | null;
  duration_seconds: number | null;
  club_id: string | null;
  court_id: string | null;
};

export type NormalizedCartLine = {
  clipId: string;
  productType: ProductType;
  coveredBySessionBundle: boolean;
};

export type NormalizedCheckoutCart = {
  bookingId: string | null;
  sessionBundle: boolean;
  lines: NormalizedCartLine[];
  clipIds: string[];
  bundleClipIds: string[];
};

/** Base products covered by a session bundle must not become separate Stripe line items. */
export function isBillableStripeLine(line: NormalizedCartLine): boolean {
  if (line.productType === 'session_bundle') {
    return false;
  }

  if (
    line.coveredBySessionBundle &&
    (line.productType === 'clip_download' || line.productType === 'full_game_hd')
  ) {
    return false;
  }

  return true;
}

export function getBillableNormalizedLines(cart: NormalizedCheckoutCart) {
  return cart.lines.filter(isBillableStripeLine);
}

export function logCartNormalization(context: Record<string, unknown>) {
  console.log('[Cart Normalize]', {
    ...context,
    timestamp: new Date().toISOString(),
  });
}

export function parseCheckoutCartMetadata(
  metadata: Record<string, string | undefined> | null | undefined
): ParsedCheckoutCart {
  const bookingId = metadata?.bookingId?.trim() || null;
  const cartJson = metadata?.cartJson?.trim();

  if (cartJson) {
    try {
      const parsed = JSON.parse(cartJson) as {
        bookingId?: string;
        sessionBundle?: boolean;
        lines?: Array<{ clipId?: string; products?: string[] }>;
      };

      const lines: CartLineInput[] = (parsed.lines ?? [])
        .map((line) => {
          const clipId = line.clipId?.trim();
          if (!clipId) {
            return null;
          }

          const products = (line.products ?? [])
            .filter((product): product is ProductType => isProductType(product));

          return { clipId, products };
        })
        .filter(Boolean) as CartLineInput[];

      return {
        version: 1,
        bookingId: parsed.bookingId?.trim() || bookingId,
        sessionBundle: Boolean(parsed.sessionBundle),
        lines,
        legacyClipIds: [],
        source: 'cartJson',
      };
    } catch (error) {
      logCartNormalization({
        phase: 'cartJson_parse_failed',
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  const rawClipIds = metadata?.clipIds ?? '';
  const singleClipId = metadata?.clipId ?? '';

  const legacyClipIds = rawClipIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (legacyClipIds.length === 0 && singleClipId.trim()) {
    legacyClipIds.push(singleClipId.trim());
  }

  return {
    version: 0,
    bookingId,
    sessionBundle: metadata?.sessionBundle === 'true',
    lines: [],
    legacyClipIds,
    source: 'legacy_clipIds',
  };
}

function expandLegacyLines(
  legacyClipIds: string[],
  clipsById: Map<string, ClipCartContext>
): CartLineInput[] {
  return legacyClipIds.map((clipId) => {
    const clip = clipsById.get(clipId);
    const baseProduct = resolveBaseProductForClip({
      duration_seconds: clip?.duration_seconds ?? null,
    });

    return {
      clipId,
      products: [baseProduct],
    };
  });
}

function dedupeProducts(products: ProductType[]) {
  return [...new Set(products)];
}

export function normalizeCheckoutCart({
  parsed,
  clips,
  sessionClips,
  hdAccessClipIds,
}: {
  parsed: ParsedCheckoutCart;
  clips: ClipCartContext[];
  sessionClips: ClipCartContext[];
  /** Clips where the buyer already has HD/base video access (PlayerTrove upsells). */
  hdAccessClipIds?: Set<string>;
}): NormalizedCheckoutCart {
  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  const sessionClipsById = new Map(sessionClips.map((clip) => [clip.id, clip]));

  const inputLines =
    parsed.version === 0
      ? expandLegacyLines(parsed.legacyClipIds, clipsById)
      : parsed.lines;

  logCartNormalization({
    phase: 'start',
    source: parsed.source,
    version: parsed.version,
    session_bundle: parsed.sessionBundle,
    input_line_count: inputLines.length,
    legacy_clip_count: parsed.legacyClipIds.length,
  });

  const bundleClipIds = parsed.sessionBundle
    ? sessionClips.map((clip) => clip.id)
    : [];

  const bundleBaseClipIds = new Set<string>();
  if (parsed.sessionBundle) {
    for (const clip of sessionClips) {
      bundleBaseClipIds.add(clip.id);
    }
  }

  const normalizedLines: NormalizedCartLine[] = [];
  const seenKeys = new Set<string>();

  for (const line of inputLines) {
    const clip = clipsById.get(line.clipId) ?? sessionClipsById.get(line.clipId);
    if (!clip) {
      logCartNormalization({
        phase: 'skip_unknown_clip',
        clip_id: line.clipId,
      });
      continue;
    }

    const products = dedupeProducts(line.products);
    const hasHdOrBundleBase =
      products.includes('full_game_hd') ||
      (parsed.sessionBundle && bundleBaseClipIds.has(line.clipId));

    for (const productType of products) {
      if (
        bundleBaseClipIds.has(line.clipId) &&
        (productType === 'clip_download' || productType === 'full_game_hd')
      ) {
        logCartNormalization({
          phase: 'skip_duplicate_base_line',
          clip_id: line.clipId,
          product_type: productType,
          reason: 'covered_by_session_bundle',
        });
        continue;
      }

      if (addonRequiresFullGameHd(productType)) {
        const baseProduct = resolveBaseProductForClip(clip);
        const hdSatisfied =
          hasHdOrBundleBase ||
          products.includes('full_game_hd') ||
          hdAccessClipIds?.has(line.clipId) ||
          (baseProduct === 'full_game_hd' &&
            parsed.sessionBundle &&
            clip.booking_id === parsed.bookingId);

        if (!hdSatisfied) {
          logCartNormalization({
            phase: 'skip_addon_without_hd',
            clip_id: line.clipId,
            product_type: productType,
          });
          continue;
        }
      }

      const key = `${line.clipId}:${productType}`;
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);

      normalizedLines.push({
        clipId: line.clipId,
        productType,
        coveredBySessionBundle: false,
      });
    }
  }

  if (parsed.sessionBundle) {
    for (const clip of sessionClips) {
      const baseProduct = resolveBaseProductForClip(clip);
      const key = `${clip.id}:${baseProduct}`;

      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      normalizedLines.push({
        clipId: clip.id,
        productType: baseProduct,
        coveredBySessionBundle: true,
      });
    }
  }

  const clipIds = [...new Set(normalizedLines.map((line) => line.clipId))];

  logCartNormalization({
    phase: 'complete',
    normalized_line_count: normalizedLines.length,
    clip_ids: clipIds,
    bundle_clip_count: bundleClipIds.length,
    products: normalizedLines.map((line) => ({
      clip_id: line.clipId,
      product_type: line.productType,
      via_bundle: line.coveredBySessionBundle,
    })),
  });

  return {
    bookingId: parsed.bookingId,
    sessionBundle: parsed.sessionBundle,
    lines: normalizedLines,
    clipIds,
    bundleClipIds,
  };
}
