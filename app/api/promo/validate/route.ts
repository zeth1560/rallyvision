import { NextRequest, NextResponse } from 'next/server';
import {
  applyPromoToPriceLines,
  buildCheckoutPriceLineKey,
  formatPromoDiscountLabel,
  loadPromoCodeByInput,
  PromoValidationError,
  validatePromoCodeForCheckout,
  type CheckoutPriceLine,
} from '@/lib/commerce/promo';
import { isProductType, type ProductType } from '@/lib/commerce/products';
import { normalizeCheckoutEmail } from '@/lib/commerce/purchase-validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code =
      typeof body?.code === 'string'
        ? body.code.trim()
        : typeof body?.promoCode === 'string'
          ? body.promoCode.trim()
          : '';

    const email = normalizeCheckoutEmail(
      typeof body?.email === 'string' ? body.email : null
    );

    const priceLinesRaw = Array.isArray(body?.price_lines) ? body.price_lines : [];

    const priceLines: CheckoutPriceLine[] = priceLinesRaw
      .map((line: unknown) => {
        if (!line || typeof line !== 'object') {
          return null;
        }

        const record = line as Record<string, unknown>;
        const productType = record.product_type ?? record.productType;

        if (typeof productType !== 'string' || !isProductType(productType)) {
          return null;
        }

        const clipId =
          typeof record.clip_id === 'string'
            ? record.clip_id
            : typeof record.clipId === 'string'
              ? record.clipId
              : null;

        const originalAmountCents = Number(
          record.original_amount_cents ?? record.originalAmountCents ?? 0
        );

        return {
          lineKey: buildCheckoutPriceLineKey(clipId, productType),
          clipId,
          productType: productType as ProductType,
          originalAmountCents,
          discountedAmountCents: originalAmountCents,
          promoCodeId: null,
        };
      })
      .filter(Boolean) as CheckoutPriceLine[];

    if (!code) {
      return NextResponse.json({ error: 'Promo code is required' }, { status: 400 });
    }

    if (priceLines.length === 0) {
      return NextResponse.json(
        { error: 'price_lines are required for promo validation' },
        { status: 400 }
      );
    }

    const promo = await validatePromoCodeForCheckout(code, {
      email,
      priceLines,
    });

    const discountedLines = applyPromoToPriceLines(priceLines, promo);
    const discountTotalCents = discountedLines.reduce(
      (sum, line) => sum + (line.originalAmountCents - line.discountedAmountCents),
      0
    );
    const totalCents = discountedLines.reduce(
      (sum, line) => sum + line.discountedAmountCents,
      0
    );

    return NextResponse.json({
      valid: true,
      code: promo.code,
      description: promo.description,
      discount_label: formatPromoDiscountLabel(promo),
      discount_total_cents: discountTotalCents,
      total_cents: totalCents,
      price_lines: discountedLines,
    });
  } catch (error) {
    if (error instanceof PromoValidationError) {
      return NextResponse.json(
        {
          valid: false,
          error: error.message,
          errorCode: error.code,
        },
        { status: 400 }
      );
    }

    console.error('[Promo Validate] error:', error);

    return NextResponse.json(
      { error: 'Failed to validate promo code' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim() ?? '';

  if (!code) {
    return NextResponse.json({ error: 'code query param is required' }, { status: 400 });
  }

  const promo = await loadPromoCodeByInput(code);

  if (!promo) {
    return NextResponse.json({ error: 'Promo code not found' }, { status: 404 });
  }

  return NextResponse.json({
    code: promo.code,
    description: promo.description,
    discount_type: promo.discount_type,
    discount_value: promo.discount_value,
    scope_type: promo.scope_type,
    product_type: promo.product_type,
    discount_label: formatPromoDiscountLabel(promo),
    is_active: promo.is_active,
    expires_at: promo.expires_at,
    once_per_email: promo.once_per_email,
    max_redemptions: promo.max_redemptions,
  });
}
