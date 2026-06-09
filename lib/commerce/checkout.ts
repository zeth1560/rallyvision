import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveProductPrice } from '@/lib/pricing';
import {
  isProductType,
  type ProductType,
} from '@/lib/commerce/products';
import {
  getBillableNormalizedLines,
  logCartNormalization,
  normalizeCheckoutCart,
  parseCheckoutCartMetadata,
  type ClipCartContext,
  type ParsedCheckoutCart,
} from '@/lib/commerce/cart-normalize';
import type { CartPayload } from '@/lib/commerce/cart-payload';
import { computeSessionDurationHours } from '@/lib/commerce/session-pricing';
import { saveCheckoutCart } from '@/lib/commerce/checkout-cart';
import {
  applyPromoToPriceLines,
  buildCheckoutPriceLineKey,
  PromoValidationError,
  type CheckoutPriceLine,
  validatePromoCodeForCheckout,
} from '@/lib/commerce/promo';
import { hasVideoBaseAccess } from '@/lib/commerce/entitlements';
import { getFeatureFlags } from '@/lib/feature-flags';
import {
  loadActiveAccessByEmailAndClips,
  normalizeCheckoutEmail,
  PurchaseValidationError,
  validateNormalizedCartPurchases,
} from '@/lib/commerce/purchase-validation';

type ClipRow = ClipCartContext & {
  slug: string | null;
  title: string | null;
  price_cents: number | null;
  published: boolean | null;
};

export type ParsedCheckoutRequest =
  | { mode: 'structured'; cart: CartPayload; bookingId: string }
  | { mode: 'legacy'; clipIds: string[]; bookingId: string };

export type CheckoutBuildOptions = {
  promoCode?: string | null;
  customerEmail?: string | null;
  playerTroveAccessId?: string | null;
};

export function parseCheckoutRequestBody(body: unknown): ParsedCheckoutRequest | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const record = body as Record<string, unknown>;
  const bookingId =
    typeof record.bookingId === 'string' ? record.bookingId.trim() : '';

  if (record.cart && typeof record.cart === 'object') {
    const cartRaw = record.cart as Record<string, unknown>;
    const linesRaw = Array.isArray(cartRaw.lines) ? cartRaw.lines : [];

    const lines = linesRaw
      .map((line) => {
        if (!line || typeof line !== 'object') {
          return null;
        }

        const lineRecord = line as Record<string, unknown>;
        const clipId =
          typeof lineRecord.clipId === 'string' ? lineRecord.clipId.trim() : '';

        if (!clipId) {
          return null;
        }

        const products = (Array.isArray(lineRecord.products) ? lineRecord.products : [])
          .filter((product): product is ProductType => typeof product === 'string' && isProductType(product));

        return { clipId, products };
      })
      .filter(Boolean) as CartPayload['lines'];

    const cartBookingId =
      typeof cartRaw.bookingId === 'string' ? cartRaw.bookingId.trim() : bookingId;

    return {
      mode: 'structured',
      bookingId: cartBookingId || bookingId,
      cart: {
        version: 2,
        bookingId: cartBookingId || bookingId,
        sessionBundle: Boolean(cartRaw.sessionBundle),
        lines,
      },
    };
  }

  const clipIdsRaw = Array.isArray(record.clipIds) ? record.clipIds : [];
  const clipIds = clipIdsRaw
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);

  if (clipIds.length === 0) {
    return null;
  }

  return {
    mode: 'legacy',
    bookingId,
    clipIds,
  };
}

export function parseCheckoutBuildOptions(body: unknown): CheckoutBuildOptions {
  if (!body || typeof body !== 'object') {
    return {};
  }

  const record = body as Record<string, unknown>;
  const promoCode =
    typeof record.promoCode === 'string'
      ? record.promoCode.trim()
      : typeof record.promo_code === 'string'
        ? record.promo_code.trim()
        : null;

  return {
    promoCode: promoCode || null,
    customerEmail: normalizeCheckoutEmail(
      typeof record.email === 'string'
        ? record.email
        : typeof record.customerEmail === 'string'
          ? record.customerEmail
          : null
    ),
  };
}

function buildParsedCartFromRequest(request: ParsedCheckoutRequest): ParsedCheckoutCart {
  if (request.mode === 'structured') {
    return {
      version: 1,
      bookingId: request.bookingId || null,
      sessionBundle: request.cart.sessionBundle,
      lines: request.cart.lines,
      legacyClipIds: [],
      source: 'cartJson',
    };
  }

  return parseCheckoutCartMetadata({
    clipIds: request.clipIds.join(','),
    bookingId: request.bookingId,
  });
}

async function resolveLineUnitAmountCents(
  clip: ClipRow,
  productType: ProductType
) {
  if (productType === 'session_bundle') {
    return 0;
  }

  const pricing = await resolveProductPrice({
    productType,
    clubId: clip.club_id,
    courtId: clip.court_id,
    fallbackPriceCents: clip.price_cents,
  });

  return pricing.priceCents;
}

function productLineItemName(
  clip: ClipRow | null,
  productType: ProductType,
  bookingId: string | null,
  promoApplied: boolean
) {
  const baseName = (() => {
    switch (productType) {
      case 'session_bundle':
        return `Session Bundle${bookingId ? ` (${bookingId})` : ''}`;
      case 'pb_vision':
        return `${clip?.title || 'Full Game'} — PB Vision Analysis`;
      case 'coach_review':
        return `${clip?.title || 'Full Game'} — Pro Review`;
      case 'full_game_hd':
        return `${clip?.title || 'Full Game'} — HD Video`;
      case 'clip_download':
      default:
        return clip?.title || 'ReplayTrove Clip';
    }
  })();

  return promoApplied ? `${baseName} (promo)` : baseName;
}

export async function buildStripeCheckoutFromRequest(
  request: ParsedCheckoutRequest,
  options: CheckoutBuildOptions = {}
) {
  const parsedCart = buildParsedCartFromRequest(request);
  const customerEmail = normalizeCheckoutEmail(options.customerEmail);

  const initialClipIds =
    request.mode === 'structured'
      ? [...new Set(request.cart.lines.map((line) => line.clipId))]
      : request.clipIds;

  if (initialClipIds.length === 0 && !parsedCart.sessionBundle) {
    throw new Error('No clip IDs were provided.');
  }

  let sessionClips: ClipRow[] = [];

  if (parsedCart.sessionBundle && parsedCart.bookingId) {
    const { data, error } = await supabaseAdmin
      .from('clips')
      .select(
        'id, slug, title, price_cents, club_id, court_id, booking_id, published, duration_seconds'
      )
      .eq('booking_id', parsedCart.bookingId)
      .eq('published', true);

    if (error) {
      throw new Error(error.message);
    }

    sessionClips = (data ?? []) as ClipRow[];
  }

  const allClipIds = [
    ...new Set([...initialClipIds, ...sessionClips.map((clip) => clip.id)]),
  ];

  let clips: ClipRow[] = [];

  if (allClipIds.length > 0) {
    const { data: clipsData, error: clipsError } = await supabaseAdmin
      .from('clips')
      .select(
        'id, slug, title, price_cents, club_id, court_id, booking_id, published, duration_seconds'
      )
      .in('id', allClipIds)
      .eq('published', true);

    if (clipsError) {
      throw new Error(clipsError.message);
    }

    clips = (clipsData ?? []) as ClipRow[];
  } else if (sessionClips.length > 0) {
    clips = sessionClips;
  }

  if (clips.length === 0 && !parsedCart.sessionBundle) {
    throw new Error('No purchasable clips were found.');
  }

  const hdAccessClipIds = new Set<string>();

  if (customerEmail && initialClipIds.length > 0) {
    const accessByClipId = await loadActiveAccessByEmailAndClips(
      customerEmail,
      initialClipIds
    );

    for (const clipId of initialClipIds) {
      const clip = clips.find((row) => row.id === clipId);
      const access = accessByClipId.get(clipId);

      if (clip && access && hasVideoBaseAccess(access, clip)) {
        hdAccessClipIds.add(clipId);
      }
    }
  }

  const normalized = normalizeCheckoutCart({
    parsed: parsedCart,
    clips,
    sessionClips,
    hdAccessClipIds,
  });

  if (normalized.lines.length === 0 && !normalized.sessionBundle) {
    throw new Error('Cart has no billable items.');
  }

  const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
  const featureFlags = await getFeatureFlags();

  await validateNormalizedCartPurchases({
    email: customerEmail ?? '',
    normalized,
    clipsById,
    featureFlags: {
      pbVisionCustomerEnabled: featureFlags.pb_vision_customer,
      sessionCoachReviewAddonEnabled: featureFlags.session_coach_review_addon,
    },
  });

  const priceLines: CheckoutPriceLine[] = [];
  let bundleAmountCents = 0;
  let bundleBilledHours = 1;
  let bundleHourlyRateCents = 0;

  if (normalized.sessionBundle && normalized.bookingId) {
    const sampleClip = clips[0] ?? sessionClips[0];

    const hourlyRate = await resolveProductPrice({
      productType: 'session_bundle',
      clubId: sampleClip?.club_id ?? null,
      courtId: sampleClip?.court_id ?? null,
    });

    const bookingResult = await supabaseAdmin
      .from('bookings')
      .select('start_time, end_time')
      .eq('booking_id', normalized.bookingId)
      .maybeSingle();

    bundleBilledHours = computeSessionDurationHours(
      bookingResult.data ?? null,
      sessionClips.length > 0 ? sessionClips : clips
    );
    bundleHourlyRateCents = hourlyRate.priceCents;
    bundleAmountCents = bundleBilledHours * bundleHourlyRateCents;

    priceLines.push({
      lineKey: buildCheckoutPriceLineKey(null, 'session_bundle'),
      clipId: null,
      productType: 'session_bundle',
      originalAmountCents: bundleAmountCents,
      discountedAmountCents: bundleAmountCents,
      promoCodeId: null,
    });
  }

  const billableLines = getBillableNormalizedLines(normalized);

  for (const line of billableLines) {
    const clip = clipsById.get(line.clipId);
    if (!clip) {
      continue;
    }

    const unitAmount = await resolveLineUnitAmountCents(clip, line.productType);

    priceLines.push({
      lineKey: buildCheckoutPriceLineKey(line.clipId, line.productType),
      clipId: line.clipId,
      productType: line.productType,
      originalAmountCents: unitAmount,
      discountedAmountCents: unitAmount,
      promoCodeId: null,
    });
  }

  let appliedPromoCodeId: string | null = null;
  let appliedPromoCode: string | null = null;
  let finalPriceLines = priceLines;

  if (options.promoCode) {
    const promo = await validatePromoCodeForCheckout(options.promoCode, {
      email: customerEmail,
      priceLines,
    });

    finalPriceLines = applyPromoToPriceLines(priceLines, promo);
    appliedPromoCodeId = promo.id;
    appliedPromoCode = promo.code;
  }

  const bundlePriceLine = finalPriceLines.find(
    (line) => line.productType === 'session_bundle'
  );
  const bundleOriginalAmountCents =
    bundlePriceLine?.originalAmountCents ?? bundleAmountCents;
  const bundleFinalAmountCents =
    bundlePriceLine?.discountedAmountCents ?? bundleAmountCents;

  const promoApplied = Boolean(appliedPromoCodeId);
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  for (const line of finalPriceLines) {
    const clip = line.clipId ? clipsById.get(line.clipId) ?? null : null;

    lineItems.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        product_data: {
          name: productLineItemName(
            clip,
            line.productType,
            normalized.bookingId,
            promoApplied && line.discountedAmountCents < line.originalAmountCents
          ),
        },
        unit_amount: line.discountedAmountCents,
      },
    });
  }

  logCartNormalization({
    phase: 'checkout_line_items_built',
    line_item_count: lineItems.length,
    billable_line_count: billableLines.length,
    session_bundle: normalized.sessionBundle,
    booking_id: normalized.bookingId,
    promo_code: appliedPromoCode,
  });

  const checkoutCartId = await saveCheckoutCart({
    parsed: parsedCart,
    bundleBilledHours,
    bundleHourlyRateCents,
    bundleAmountCents: bundleOriginalAmountCents,
    bundleOriginalAmountCents,
    bundleFinalAmountCents,
    priceLines: finalPriceLines,
    promoCodeId: appliedPromoCodeId,
    promoCode: appliedPromoCode,
    customerEmail,
    playerTroveAccessId: options.playerTroveAccessId ?? null,
  });

  const metadata: Record<string, string> = {
    checkoutCartId,
  };

  if (options.playerTroveAccessId) {
    metadata.playerTroveAccessId = options.playerTroveAccessId;
  }

  return {
    lineItems,
    metadata,
    checkoutCartId,
    normalized,
    priceLines: finalPriceLines,
    promoCodeId: appliedPromoCodeId,
    promoCode: appliedPromoCode,
  };
}

export { PromoValidationError, PurchaseValidationError };
