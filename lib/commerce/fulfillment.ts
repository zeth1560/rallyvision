import { supabaseAdmin } from '@/lib/supabase-admin';
import { copyObjectWithinBucket } from '@/lib/s3';
import { sendPurchaseConfirmationEmail } from '@/lib/email';
import {
  buildEntitlementPatchForProduct,
  computePurchaseWindowExpiry,
  logEntitlementGrant,
  mergeEntitlementPatches,
  type EntitlementGrantPatch,
} from '@/lib/commerce/entitlements';
import {
  logCartNormalization,
  normalizeCheckoutCart,
  type ClipCartContext,
} from '@/lib/commerce/cart-normalize';
import { resolveCheckoutCartForFulfillment } from '@/lib/commerce/checkout-cart';
import {
  buildCheckoutPriceLineKey,
  getTotalDiscountCents,
  recordPromoRedemption,
} from '@/lib/commerce/promo';
import { normalizeCheckoutEmail } from '@/lib/commerce/purchase-validation';
import {
  completeCheckoutFulfillment,
  failCheckoutFulfillment,
  hasExistingOrderLineItems,
  hasExistingSessionOrders,
} from '@/lib/commerce/fulfillment-lock';
import { resolveBaseProductForClip } from '@/lib/commerce/products';
import { autoSubmitPbVisionAfterPurchase } from '@/lib/pb-vision-request';
import type Stripe from 'stripe';

const FULL_GAME_MIN_SECONDS = 5 * 60;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type PurchasedClipRow = {
  id: string;
  title: string | null;
  slug: string | null;
  created_at: string | null;
  s3_key: string | null;
  thumbnail_s3_key: string | null;
  booking_id: string | null;
  duration_seconds: number | null;
  club_id: string | null;
  court_id: string | null;
};

function needsPurchasedCopy(productTypes: Set<string>) {
  return productTypes.has('clip_download') || productTypes.has('full_game_hd');
}

export async function fulfillStripeCheckoutSession({
  session,
  email,
  paymentIntentId,
}: {
  session: Stripe.Checkout.Session;
  email: string;
  paymentIntentId: string | null;
}) {
  const stripeEmail = normalizeCheckoutEmail(email);
  const resolvedCart = await resolveCheckoutCartForFulfillment(
    session.metadata ?? undefined
  );
  const parsed = resolvedCart.parsed;
  const playerTroveAccessId =
    resolvedCart.playerTroveAccessId?.trim() ||
    session.metadata?.playerTroveAccessId?.trim() ||
    null;
  const normalizedEmail =
    normalizeCheckoutEmail(resolvedCart.customerEmail) ?? stripeEmail;

  if (!normalizedEmail) {
    throw new Error('Missing customer email for fulfillment');
  }

  logCartNormalization({
    phase: 'fulfillment_start',
    stripe_session_id: session.id,
    cart_source: parsed.source,
    cart_version: parsed.version,
    checkout_cart_source: resolvedCart.source,
  });

  const initialClipIds =
    parsed.legacyClipIds.length > 0
      ? parsed.legacyClipIds
      : [...new Set(parsed.lines.map((line) => line.clipId))];

  if (initialClipIds.length === 0 && !parsed.sessionBundle) {
    throw new Error('Missing clip metadata');
  }

  let sessionClips: ClipCartContext[] = [];

  if (parsed.sessionBundle && parsed.bookingId) {
    const { data, error } = await supabaseAdmin
      .from('clips')
      .select(
        'id, booking_id, duration_seconds, club_id, court_id, title, slug, created_at, s3_key, thumbnail_s3_key'
      )
      .eq('booking_id', parsed.bookingId)
      .eq('published', true);

    if (error) {
      throw new Error(`Failed to load session clips: ${error.message}`);
    }

    sessionClips = (data ?? []) as PurchasedClipRow[];
  }

  const allClipIds = [
    ...new Set([
      ...initialClipIds,
      ...sessionClips.map((clip) => clip.id),
    ]),
  ];

  const { data: purchasedClips, error: purchasedClipsError } = await supabaseAdmin
    .from('clips')
    .select(
      'id, title, slug, created_at, s3_key, thumbnail_s3_key, booking_id, duration_seconds, club_id, court_id'
    )
    .in('id', allClipIds);

  if (purchasedClipsError) {
    throw new Error(`Failed to load purchased clips: ${purchasedClipsError.message}`);
  }

  if (!purchasedClips || purchasedClips.length === 0) {
    throw new Error('No matching clips found');
  }

  const clipRows = purchasedClips as PurchasedClipRow[];
  const normalized = normalizeCheckoutCart({
    parsed,
    clips: clipRows,
    sessionClips,
  });

  if (normalized.lines.length === 0) {
    throw new Error('No fulfillable cart lines after normalization');
  }

  const productsByClip = new Map<string, Set<string>>();
  for (const line of normalized.lines) {
    const existing = productsByClip.get(line.clipId) ?? new Set<string>();
    existing.add(line.productType);
    productsByClip.set(line.clipId, existing);
  }

  const orderClipIds = [...productsByClip.keys()];

  let insertedOrders: Array<{ id: string; clip_id: string }> = [];
  let orderIdByClipId = new Map<string, string>();

  if (await hasExistingSessionOrders(session.id)) {
    const { data: existingOrders, error: existingOrdersError } = await supabaseAdmin
      .from('orders')
      .select('id, clip_id')
      .eq('stripe_checkout_session_id', session.id);

    if (existingOrdersError) {
      throw new Error(`Failed to load existing orders: ${existingOrdersError.message}`);
    }

    insertedOrders = (existingOrders ?? []) as Array<{ id: string; clip_id: string }>;
  } else {
    const rows = orderClipIds.map((clipId) => ({
      clip_id: clipId,
      email: normalizedEmail,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      amount_total: session.amount_total,
      currency: session.currency,
      status: 'paid',
    }));

    const { data: newOrders, error: insertError } = await supabaseAdmin
      .from('orders')
      .insert(rows)
      .select('id, clip_id');

    if (insertError) {
      throw new Error(`Database write failed: ${insertError.message}`);
    }

    insertedOrders = (newOrders ?? []) as Array<{ id: string; clip_id: string }>;
  }

  for (const order of insertedOrders) {
    orderIdByClipId.set(order.clip_id, order.id);
  }

  const priceLineByKey = new Map(
    (resolvedCart.priceLines ?? []).map((line) => [line.lineKey, line])
  );

  const bundleOriginalAmountCents =
    resolvedCart.bundleOriginalAmountCents ?? resolvedCart.bundleAmountCents;
  const bundleFinalAmountCents =
    resolvedCart.bundleFinalAmountCents ?? resolvedCart.bundleAmountCents;

  if (!(await hasExistingOrderLineItems(session.id))) {
    const lineItemRows: Array<{
      order_id: string | null;
      stripe_checkout_session_id: string;
      clip_id: string | null;
      booking_id: string | null;
      product_type: string;
      unit_amount_cents: number;
      original_unit_amount_cents: number;
      promo_code_id: string | null;
      quantity: number;
    }> = normalized.lines.map((line) => {
      const lineKey = buildCheckoutPriceLineKey(line.clipId, line.productType);
      const pricedLine = priceLineByKey.get(lineKey);

      return {
        order_id: orderIdByClipId.get(line.clipId) ?? null,
        stripe_checkout_session_id: session.id,
        clip_id: line.clipId,
        booking_id: parsed.bookingId,
        product_type: line.productType,
        unit_amount_cents: pricedLine?.discountedAmountCents ?? 0,
        original_unit_amount_cents: pricedLine?.originalAmountCents ?? 0,
        promo_code_id: pricedLine?.promoCodeId ?? null,
        quantity: 1,
      };
    });

    if (parsed.sessionBundle && parsed.bookingId) {
      const bundleLineKey = buildCheckoutPriceLineKey(null, 'session_bundle');
      const bundlePricedLine = priceLineByKey.get(bundleLineKey);

      lineItemRows.push({
        order_id: insertedOrders[0]?.id ?? null,
        stripe_checkout_session_id: session.id,
        clip_id: null,
        booking_id: parsed.bookingId,
        product_type: 'session_bundle',
        unit_amount_cents:
          bundlePricedLine?.discountedAmountCents ?? bundleFinalAmountCents,
        original_unit_amount_cents:
          bundlePricedLine?.originalAmountCents ?? bundleOriginalAmountCents,
        promo_code_id: bundlePricedLine?.promoCodeId ?? null,
        quantity: 1,
      });
    }

    const { error: lineItemsError } = await supabaseAdmin
      .from('order_line_items')
      .insert(lineItemRows);

    if (lineItemsError) {
      throw new Error(`Failed to insert order_line_items: ${lineItemsError.message}`);
    }
  }

  if (resolvedCart.promoCodeId && resolvedCart.priceLines?.length) {
    await recordPromoRedemption({
      promoCodeId: resolvedCart.promoCodeId,
      email: normalizedEmail,
      stripeCheckoutSessionId: session.id,
      orderId: insertedOrders[0]?.id ?? null,
      discountAmountCents: getTotalDiscountCents(resolvedCart.priceLines),
    });
  }

  if (parsed.sessionBundle && parsed.bookingId) {
    const bundlePayload = {
      booking_id: parsed.bookingId,
      email: normalizedEmail,
      stripe_checkout_session_id: session.id,
      order_id: insertedOrders[0]?.id ?? null,
      billed_hours: resolvedCart.bundleBilledHours,
      hourly_rate_cents: resolvedCart.bundleHourlyRateCents,
      amount_cents: bundleFinalAmountCents,
      original_amount_cents: bundleOriginalAmountCents,
      final_amount_cents: bundleFinalAmountCents,
    };

    const { data: existingBundle, error: existingBundleError } =
      await supabaseAdmin
        .from('session_bundle_purchases')
        .select('id')
        .eq('booking_id', parsed.bookingId)
        .ilike('email', normalizedEmail)
        .maybeSingle();

    if (existingBundleError) {
      throw new Error(
        `Failed to check session bundle purchase: ${existingBundleError.message}`
      );
    }

    const bundleWrite = existingBundle
      ? supabaseAdmin
          .from('session_bundle_purchases')
          .update(bundlePayload)
          .eq('id', existingBundle.id)
      : supabaseAdmin.from('session_bundle_purchases').insert(bundlePayload);

    const { error: bundleError } = await bundleWrite;

    if (bundleError) {
      throw new Error(
        `Failed to write session_bundle_purchases: ${bundleError.message}`
      );
    }

    logEntitlementGrant({
      phase: 'session_bundle_recorded',
      stripe_session_id: session.id,
      booking_id: parsed.bookingId,
      email: normalizedEmail,
      original_amount_cents: bundleOriginalAmountCents,
      final_amount_cents: bundleFinalAmountCents,
    });
  }

  const copyResults = new Map<
    string,
    { purchased_s3_key: string; purchased_copy_created_at: string }
  >();

  for (const clip of clipRows) {
    const products = productsByClip.get(clip.id);
    if (!products || !needsPurchasedCopy(products) || !clip.s3_key) {
      continue;
    }

    const originalFilename = clip.s3_key.split('/').pop() || `${clip.id}.mp4`;
    const purchasedS3Key = `purchased/${session.id}/${originalFilename}`;

    try {
      await copyObjectWithinBucket(clip.s3_key, purchasedS3Key);
      copyResults.set(clip.id, {
        purchased_s3_key: purchasedS3Key,
        purchased_copy_created_at: new Date().toISOString(),
      });
    } catch (copyError) {
      console.error('[Fulfillment] Purchase copy failed', {
        clip_id: clip.id,
        error: copyError,
      });
    }
  }

  const now = new Date();
  const purchasedAt = now.toISOString();

  for (const clipId of orderClipIds) {
    const clip = clipRows.find((row) => row.id === clipId);
    if (!clip) {
      continue;
    }

    const lineProducts = normalized.lines.filter((line) => line.clipId === clipId);
    const entitlementPatch = mergeEntitlementPatches(
      ...lineProducts.map((line) =>
        buildEntitlementPatchForProduct(line.productType, purchasedAt, {
          grantedViaSessionBundle: line.coveredBySessionBundle,
        })
      )
    );

    const purchaseWindowExpires = computePurchaseWindowExpiry(
      clip.created_at,
      now
    ).toISOString();

    const accessPayload = {
      email: normalizedEmail,
      clip_id: clipId,
      order_id: orderIdByClipId.get(clipId) ?? null,
      stripe_checkout_session_id: session.id,
      access_source: 'stripe' as const,
      access_status: 'active' as const,
      purchased_at: purchasedAt,
      purchase_window_expires_at: purchaseWindowExpires,
      thumbnail_s3_key: clip.thumbnail_s3_key ?? null,
      ...entitlementPatch,
    };

    const { data: existingAccessBySession } = await supabaseAdmin
      .from('player_video_access')
      .select('id')
      .eq('email', normalizedEmail)
      .eq('clip_id', clipId)
      .eq('stripe_checkout_session_id', session.id)
      .maybeSingle();

    let existingAccess = existingAccessBySession;

    if (
      !existingAccess &&
      playerTroveAccessId &&
      orderClipIds.length === 1 &&
      clipId === orderClipIds[0]
    ) {
      const { data: targetedAccess } = await supabaseAdmin
        .from('player_video_access')
        .select('id')
        .eq('id', playerTroveAccessId)
        .eq('email', normalizedEmail)
        .eq('clip_id', clipId)
        .eq('access_status', 'active')
        .maybeSingle();

      existingAccess = targetedAccess;
    }

    if (!existingAccess) {
      const { data: existingActiveAccess } = await supabaseAdmin
        .from('player_video_access')
        .select('id')
        .eq('email', normalizedEmail)
        .eq('clip_id', clipId)
        .eq('access_status', 'active')
        .order('purchased_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      existingAccess = existingActiveAccess;
    }

    let accessId = existingAccess?.id as string | undefined;

    if (existingAccess) {
      const { error: updateError } = await supabaseAdmin
        .from('player_video_access')
        .update({
          ...entitlementPatch,
          order_id: orderIdByClipId.get(clipId) ?? null,
          stripe_checkout_session_id: session.id,
          updated_at: purchasedAt,
        })
        .eq('id', existingAccess.id);

      if (updateError) {
        console.error('[Fulfillment] Failed to update player_video_access', {
          access_id: existingAccess.id,
          clip_id: clipId,
          error: updateError.message,
        });
      }
    } else {
      const { data: insertedAccess, error: accessError } = await supabaseAdmin
        .from('player_video_access')
        .insert(accessPayload)
        .select('id')
        .single();

      if (accessError) {
        console.error('[Fulfillment] Failed to create player_video_access', {
          clip_id: clipId,
          error: accessError.message,
        });
        continue;
      }

      accessId = insertedAccess.id;
    }

    const copyMeta = copyResults.get(clipId);
    if (copyMeta && accessId) {
      await supabaseAdmin
        .from('player_video_access')
        .update({
          purchased_s3_key: copyMeta.purchased_s3_key,
          purchased_copy_created_at: copyMeta.purchased_copy_created_at,
        })
        .eq('id', accessId);
    }

    logEntitlementGrant({
      phase: 'access_granted',
      stripe_session_id: session.id,
      clip_id: clipId,
      access_id: accessId,
      products: lineProducts.map((line) => line.productType),
      base_product: resolveBaseProductForClip(clip),
      via_session_bundle: lineProducts.some((line) => line.coveredBySessionBundle),
      entitlement_patch: entitlementPatch,
    });

    const purchasedPbVision = lineProducts.some(
      (line) => line.productType === 'pb_vision'
    );
    const isFullGame =
      clip.duration_seconds != null &&
      clip.duration_seconds >= FULL_GAME_MIN_SECONDS;

    if (purchasedPbVision && accessId && isFullGame) {
      try {
        const autoSubmitResult = await autoSubmitPbVisionAfterPurchase({
          accessId,
          email: normalizedEmail,
        });

        if (!autoSubmitResult.ok) {
          console.error('[Fulfillment] PB Vision auto-submit failed', {
            access_id: accessId,
            clip_id: clipId,
            error: autoSubmitResult.error,
          });
        } else {
          console.log('[Fulfillment] PB Vision auto-submitted after purchase', {
            access_id: accessId,
            clip_id: clipId,
            request_id: autoSubmitResult.request_id,
            status: autoSubmitResult.status,
          });
        }
      } catch (autoSubmitError) {
        console.error('[Fulfillment] PB Vision auto-submit error', {
          access_id: accessId,
          clip_id: clipId,
          error:
            autoSubmitError instanceof Error
              ? autoSubmitError.message
              : autoSubmitError,
        });
      }
    }
  }

  try {
    await sendPurchaseConfirmationEmail({
      to: normalizedEmail,
      sessionId: session.id,
      clips: clipRows
        .filter((clip) => orderClipIds.includes(clip.id))
        .map((clip) => ({
          title: clip.title || 'ReplayTrove Clip',
          slug: clip.slug || clip.id,
        })),
    });
  } catch (emailError) {
    console.error('[Fulfillment] Failed to send purchase email', emailError);
  }

  logCartNormalization({
    phase: 'fulfillment_complete',
    stripe_session_id: session.id,
    order_count: insertedOrders.length,
    email: normalizedEmail,
  });
}

export async function runStripeCheckoutFulfillment({
  session,
  email,
  paymentIntentId,
}: {
  session: Stripe.Checkout.Session;
  email: string;
  paymentIntentId: string | null;
}) {
  try {
    await fulfillStripeCheckoutSession({
      session,
      email,
      paymentIntentId,
    });
    await completeCheckoutFulfillment(session.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failCheckoutFulfillment(session.id, message);
    throw error;
  }
}

export function grantBaseProductEntitlementsForFreeAccess({
  clip,
  purchasedAt,
  grantedViaSessionBundle = false,
}: {
  clip: ClipCartContext;
  purchasedAt: string;
  grantedViaSessionBundle?: boolean;
}) {
  const baseProduct = resolveBaseProductForClip(clip);
  return buildEntitlementPatchForProduct(baseProduct, purchasedAt, {
    grantedViaSessionBundle,
  });
}

export function buildFreeAccessExpiryFields(
  clipCreatedAt: string | null | undefined,
  purchasedAt: string
) {
  const now = new Date(purchasedAt);
  const downloadExpiresAt = new Date(now.getTime() + THIRTY_DAYS_MS).toISOString();
  const purchaseWindowExpires = computePurchaseWindowExpiry(
    clipCreatedAt,
    now
  ).toISOString();

  return {
    download_expires_at: downloadExpiresAt,
    purchase_window_expires_at: purchaseWindowExpires,
  };
}
