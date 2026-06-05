import { isProductType, type ProductType } from '@/lib/commerce/products';

export type PromoDiscountType = 'percentage' | 'fixed_amount' | 'free';
export type PromoScopeType = 'product' | 'cart';

export type PromoCodeRow = {
  id: string;
  code: string;
  description: string | null;
  discount_type: PromoDiscountType;
  discount_value: number;
  scope_type: PromoScopeType;
  product_type: ProductType | null;
  expires_at: string | null;
  max_redemptions: number | null;
  once_per_email: boolean;
  is_active: boolean;
  created_at: string | null;
};

export type CheckoutPriceLine = {
  lineKey: string;
  clipId: string | null;
  productType: ProductType;
  originalAmountCents: number;
  discountedAmountCents: number;
  promoCodeId: string | null;
};

export type PromoValidationContext = {
  email?: string | null;
  priceLines: CheckoutPriceLine[];
};

export class PromoValidationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PromoValidationError';
    this.code = code;
  }
}

export function normalizePromoCodeInput(code: string) {
  return code.trim().toUpperCase();
}

export function buildCheckoutPriceLineKey(
  clipId: string | null,
  productType: ProductType
) {
  return clipId ? `${clipId}:${productType}` : productType;
}

function lineMatchesPromoScope(line: CheckoutPriceLine, promo: PromoCodeRow) {
  if (promo.scope_type === 'cart') {
    return line.originalAmountCents > 0;
  }

  return line.productType === promo.product_type && line.originalAmountCents > 0;
}

export function computePromoDiscountTotal(
  eligibleTotalCents: number,
  promo: PromoCodeRow
) {
  if (eligibleTotalCents <= 0) {
    return 0;
  }

  switch (promo.discount_type) {
    case 'free':
      return eligibleTotalCents;
    case 'percentage':
      return Math.min(
        eligibleTotalCents,
        Math.round(eligibleTotalCents * (promo.discount_value / 100))
      );
    case 'fixed_amount':
      return Math.min(promo.discount_value, eligibleTotalCents);
    default:
      return 0;
  }
}

export function applyPromoToPriceLines(
  lines: CheckoutPriceLine[],
  promo: PromoCodeRow
): CheckoutPriceLine[] {
  const eligible = lines.filter((line) => lineMatchesPromoScope(line, promo));

  if (eligible.length === 0) {
    throw new PromoValidationError(
      'PROMO_SCOPE_MISMATCH',
      'This promo code does not apply to any items in your cart.'
    );
  }

  const eligibleTotal = eligible.reduce(
    (sum, line) => sum + line.originalAmountCents,
    0
  );
  const totalDiscount = computePromoDiscountTotal(eligibleTotal, promo);

  if (totalDiscount <= 0) {
    return lines.map((line) => ({ ...line }));
  }

  const result = lines.map((line) => ({ ...line }));
  let remainingDiscount = totalDiscount;

  for (let index = 0; index < eligible.length; index += 1) {
    const line = eligible[index];
    const resultIndex = result.findIndex((entry) => entry.lineKey === line.lineKey);

    if (resultIndex === -1) {
      continue;
    }

    let lineDiscount: number;

    if (index === eligible.length - 1) {
      lineDiscount = remainingDiscount;
    } else {
      lineDiscount = Math.round(
        (line.originalAmountCents / eligibleTotal) * totalDiscount
      );
      remainingDiscount -= lineDiscount;
    }

    result[resultIndex] = {
      ...result[resultIndex],
      discountedAmountCents: Math.max(
        0,
        line.originalAmountCents - lineDiscount
      ),
      promoCodeId: promo.id,
    };
  }

  return result;
}

export async function loadPromoCodeByInput(code: string) {
  const { supabaseAdmin } = await import('@/lib/supabase-admin');
  const normalizedCode = normalizePromoCodeInput(code);

  if (!normalizedCode) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from('promo_codes')
    .select(
      'id, code, description, discount_type, discount_value, scope_type, product_type, expires_at, max_redemptions, once_per_email, is_active, created_at'
    )
    .ilike('code', normalizedCode)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as PromoCodeRow;
}

async function countPromoRedemptions(promoCodeId: string) {
  const { supabaseAdmin } = await import('@/lib/supabase-admin');
  const { count, error } = await supabaseAdmin
    .from('promo_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('promo_code_id', promoCodeId);

  if (error) {
    throw new Error(`Failed to count promo redemptions: ${error.message}`);
  }

  return count ?? 0;
}

async function hasEmailRedeemedPromo(promoCodeId: string, email: string) {
  const { supabaseAdmin } = await import('@/lib/supabase-admin');
  const { data, error } = await supabaseAdmin
    .from('promo_redemptions')
    .select('id')
    .eq('promo_code_id', promoCodeId)
    .eq('email', email.toLowerCase().trim())
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check promo redemption: ${error.message}`);
  }

  return Boolean(data);
}

export async function validatePromoCodeForCheckout(
  code: string,
  context: PromoValidationContext
): Promise<PromoCodeRow> {
  const promo = await loadPromoCodeByInput(code);

  if (!promo) {
    throw new PromoValidationError('PROMO_NOT_FOUND', 'Promo code not found.');
  }

  const redemptionCount = await countPromoRedemptions(promo.id);
  const emailAlreadyRedeemed =
    promo.once_per_email && context.email
      ? await hasEmailRedeemedPromo(promo.id, context.email)
      : false;

  return validatePromoCodeRow(promo, context, {
    redemptionCount,
    emailAlreadyRedeemed,
  });
}

export function validatePromoCodeRow(
  promo: PromoCodeRow,
  context: PromoValidationContext,
  options?: {
    redemptionCount?: number;
    emailAlreadyRedeemed?: boolean;
  }
): PromoCodeRow {
  if (!promo.is_active) {
    throw new PromoValidationError('PROMO_INACTIVE', 'This promo code is inactive.');
  }

  if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
    throw new PromoValidationError('PROMO_EXPIRED', 'This promo code has expired.');
  }

  const redemptionCount = options?.redemptionCount ?? 0;

  if (
    promo.max_redemptions != null &&
    redemptionCount >= promo.max_redemptions
  ) {
    throw new PromoValidationError(
      'PROMO_MAX_REDEMPTIONS',
      'This promo code has reached its redemption limit.'
    );
  }

  const normalizedEmail = context.email?.toLowerCase().trim();

  if (promo.once_per_email) {
    if (!normalizedEmail) {
      throw new PromoValidationError(
        'PROMO_EMAIL_REQUIRED',
        'An email address is required to use this promo code.'
      );
    }

    if (options?.emailAlreadyRedeemed) {
      throw new PromoValidationError(
        'PROMO_ALREADY_USED',
        'You have already used this promo code.'
      );
    }
  }

  const eligibleLines = context.priceLines.filter((line) =>
    lineMatchesPromoScope(line, promo)
  );

  if (eligibleLines.length === 0) {
    throw new PromoValidationError(
      'PROMO_SCOPE_MISMATCH',
      'This promo code does not apply to any items in your cart.'
    );
  }

  if (
    promo.scope_type === 'product' &&
    promo.product_type &&
    !isProductType(promo.product_type)
  ) {
    throw new PromoValidationError(
      'PROMO_INVALID',
      'This promo code is misconfigured.'
    );
  }

  return promo;
}

export async function recordPromoRedemption({
  promoCodeId,
  email,
  stripeCheckoutSessionId,
  orderId,
  discountAmountCents,
}: {
  promoCodeId: string;
  email: string;
  stripeCheckoutSessionId: string;
  orderId?: string | null;
  discountAmountCents: number;
}) {
  const { supabaseAdmin } = await import('@/lib/supabase-admin');
  const normalizedEmail = email.toLowerCase().trim();
  const { error } = await supabaseAdmin.from('promo_redemptions').upsert(
    {
      promo_code_id: promoCodeId,
      email: normalizedEmail,
      stripe_checkout_session_id: stripeCheckoutSessionId,
      order_id: orderId ?? null,
      discount_amount_cents: discountAmountCents,
    },
    { onConflict: 'stripe_checkout_session_id', ignoreDuplicates: true }
  );

  if (error) {
    throw new Error(`Failed to record promo redemption: ${error.message}`);
  }
}

export function getTotalDiscountCents(lines: CheckoutPriceLine[]) {
  return lines.reduce(
    (sum, line) => sum + (line.originalAmountCents - line.discountedAmountCents),
    0
  );
}

export function formatPromoDiscountLabel(promo: PromoCodeRow) {
  switch (promo.discount_type) {
    case 'free':
      return '100% off';
    case 'percentage':
      return `${promo.discount_value}% off`;
    case 'fixed_amount':
      return `$${(promo.discount_value / 100).toFixed(2)} off`;
    default:
      return 'Discount';
  }
}
