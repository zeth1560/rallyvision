import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  parseCheckoutCartMetadata,
  type ParsedCheckoutCart,
} from '@/lib/commerce/cart-normalize';
import type { CheckoutPriceLine } from '@/lib/commerce/promo';

export type StoredCheckoutCartPayload = {
  parsed: ParsedCheckoutCart;
  bundleBilledHours: number;
  bundleHourlyRateCents: number;
  bundleAmountCents: number;
  bundleOriginalAmountCents?: number;
  bundleFinalAmountCents?: number;
  priceLines?: CheckoutPriceLine[];
  promoCodeId?: string | null;
  promoCode?: string | null;
  customerEmail?: string | null;
  playerTroveAccessId?: string | null;
};

export type ResolvedCheckoutCart = StoredCheckoutCartPayload & {
  source: 'checkout_cart_db' | 'stripe_metadata_legacy';
};

function parseStoredPayload(raw: unknown): StoredCheckoutCartPayload | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const parsed = record.parsed as ParsedCheckoutCart | undefined;

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const bundleAmountCents = Number(record.bundleAmountCents ?? 0);

  return {
    parsed,
    bundleBilledHours: Number(record.bundleBilledHours ?? 1),
    bundleHourlyRateCents: Number(record.bundleHourlyRateCents ?? 0),
    bundleAmountCents,
    bundleOriginalAmountCents: Number(
      record.bundleOriginalAmountCents ?? bundleAmountCents
    ),
    bundleFinalAmountCents: Number(
      record.bundleFinalAmountCents ?? bundleAmountCents
    ),
    priceLines: Array.isArray(record.priceLines)
      ? (record.priceLines as CheckoutPriceLine[])
      : undefined,
    promoCodeId:
      typeof record.promoCodeId === 'string' ? record.promoCodeId : null,
    promoCode: typeof record.promoCode === 'string' ? record.promoCode : null,
    customerEmail:
      typeof record.customerEmail === 'string' ? record.customerEmail : null,
    playerTroveAccessId:
      typeof record.playerTroveAccessId === 'string'
        ? record.playerTroveAccessId
        : null,
  };
}

export async function saveCheckoutCart(payload: StoredCheckoutCartPayload) {
  const { data, error } = await supabaseAdmin
    .from('checkout_carts')
    .insert({
      booking_id: payload.parsed.bookingId,
      session_bundle: payload.parsed.sessionBundle,
      cart_json: payload,
      bundle_billed_hours: payload.bundleBilledHours,
      bundle_hourly_rate_cents: payload.bundleHourlyRateCents,
      bundle_amount_cents: payload.bundleAmountCents,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to persist checkout cart: ${error?.message ?? 'unknown'}`);
  }

  return data.id as string;
}

export async function linkCheckoutCartToStripeSession(
  checkoutCartId: string,
  stripeCheckoutSessionId: string
) {
  const { error } = await supabaseAdmin
    .from('checkout_carts')
    .update({ stripe_checkout_session_id: stripeCheckoutSessionId })
    .eq('id', checkoutCartId);

  if (error) {
    console.error('[CheckoutCart] Failed to link Stripe session', {
      checkout_cart_id: checkoutCartId,
      stripe_checkout_session_id: stripeCheckoutSessionId,
      error: error.message,
    });
  }
}

export async function loadCheckoutCartById(
  checkoutCartId: string
): Promise<StoredCheckoutCartPayload | null> {
  const { data, error } = await supabaseAdmin
    .from('checkout_carts')
    .select('cart_json')
    .eq('id', checkoutCartId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return parseStoredPayload(data.cart_json);
}

export async function resolveCheckoutCartForFulfillment(
  metadata: Record<string, string | undefined> | null | undefined
): Promise<ResolvedCheckoutCart> {
  const checkoutCartId = metadata?.checkoutCartId?.trim();

  if (checkoutCartId) {
    const stored = await loadCheckoutCartById(checkoutCartId);

    if (stored) {
      return {
        ...stored,
        source: 'checkout_cart_db',
      };
    }

    console.error('[CheckoutCart] checkoutCartId not found, falling back to metadata', {
      checkout_cart_id: checkoutCartId,
    });
  }

  const parsed = parseCheckoutCartMetadata(metadata);

  return {
    parsed,
    bundleBilledHours: Number(metadata?.bundleBilledHours ?? 1),
    bundleHourlyRateCents: Number(metadata?.bundleHourlyRateCents ?? 0),
    bundleAmountCents: Number(metadata?.bundleAmountCents ?? 0),
    source: 'stripe_metadata_legacy',
  };
}
