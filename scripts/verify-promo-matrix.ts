/**
 * Promo code QA — run with: npx tsx scripts/verify-promo-matrix.ts
 */
import {
  applyPromoToPriceLines,
  buildCheckoutPriceLineKey,
  computePromoDiscountTotal,
  PromoValidationError,
  validatePromoCodeRow,
  type CheckoutPriceLine,
  type PromoCodeRow,
} from '../lib/commerce/promo';
import { normalizeCheckoutEmail } from '../lib/commerce/purchase-validation';

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    console.log(`✓ ${name}`);
    passed += 1;
  } else {
    console.error(`✗ ${name}`);
    failed += 1;
  }
}

function expectPromoError(
  name: string,
  fn: () => void,
  expectedCode: string
) {
  try {
    fn();
    assert(name, false);
  } catch (error) {
    assert(
      name,
      error instanceof PromoValidationError && error.code === expectedCode
    );
  }
}

function basePromo(overrides: Partial<PromoCodeRow>): PromoCodeRow {
  return {
    id: 'promo-1',
    code: 'TEST',
    description: null,
    discount_type: 'percentage',
    discount_value: 20,
    scope_type: 'product',
    product_type: 'pb_vision',
    expires_at: null,
    max_redemptions: null,
    once_per_email: false,
    is_active: true,
    created_at: null,
    ...overrides,
  };
}

const pbVisionLine: CheckoutPriceLine = {
  lineKey: buildCheckoutPriceLineKey('clip-1', 'pb_vision'),
  clipId: 'clip-1',
  productType: 'pb_vision',
  originalAmountCents: 800,
  discountedAmountCents: 800,
  promoCodeId: null,
};

const coachReviewLine: CheckoutPriceLine = {
  lineKey: buildCheckoutPriceLineKey('clip-1', 'coach_review'),
  clipId: 'clip-1',
  productType: 'coach_review',
  originalAmountCents: 600,
  discountedAmountCents: 600,
  promoCodeId: null,
};

const sessionBundleLine: CheckoutPriceLine = {
  lineKey: buildCheckoutPriceLineKey(null, 'session_bundle'),
  clipId: null,
  productType: 'session_bundle',
  originalAmountCents: 3000,
  discountedAmountCents: 3000,
  promoCodeId: null,
};

const freePbPromo = basePromo({
  code: 'FREEPB',
  discount_type: 'free',
  product_type: 'pb_vision',
});

const freePbResult = applyPromoToPriceLines([pbVisionLine], freePbPromo);
assert(
  'free PB Vision promo zeroes PB Vision line',
  freePbResult[0].discountedAmountCents === 0 &&
    freePbResult[0].promoCodeId === freePbPromo.id
);

const coachPercentPromo = basePromo({
  code: 'COACH20',
  discount_type: 'percentage',
  discount_value: 20,
  product_type: 'coach_review',
});

const coachResult = applyPromoToPriceLines([coachReviewLine], coachPercentPromo);
assert(
  'Coach Review percentage discount applies to scoped product',
  coachResult[0].discountedAmountCents === 480
);

expectPromoError(
  'expired promo rejection',
  () =>
    validatePromoCodeRow(
      basePromo({ expires_at: new Date(Date.now() - 60_000).toISOString() }),
      { priceLines: [pbVisionLine] }
    ),
  'PROMO_EXPIRED'
);

expectPromoError(
  'inactive promo rejection',
  () =>
    validatePromoCodeRow(
      basePromo({ is_active: false }),
      { priceLines: [pbVisionLine] }
    ),
  'PROMO_INACTIVE'
);

expectPromoError(
  'max redemption rejection',
  () =>
    validatePromoCodeRow(
      basePromo({ max_redemptions: 5 }),
      { priceLines: [pbVisionLine] },
      { redemptionCount: 5 }
    ),
  'PROMO_MAX_REDEMPTIONS'
);

expectPromoError(
  'once-per-email rejection',
  () =>
    validatePromoCodeRow(
      basePromo({ once_per_email: true }),
      { email: 'player@example.com', priceLines: [pbVisionLine] },
      { emailAlreadyRedeemed: true }
    ),
  'PROMO_ALREADY_USED'
);

expectPromoError(
  'scope mismatch rejection',
  () =>
    validatePromoCodeRow(freePbPromo, { priceLines: [coachReviewLine] }),
  'PROMO_SCOPE_MISMATCH'
);

const sessionPromo = basePromo({
  code: 'BUNDLE10',
  scope_type: 'cart',
  product_type: null,
  discount_type: 'percentage',
  discount_value: 10,
});

const sessionLines = [sessionBundleLine, pbVisionLine];
const sessionDiscount = computePromoDiscountTotal(
  sessionLines.reduce((sum, line) => sum + line.originalAmountCents, 0),
  sessionPromo
);
assert(
  'session checkout cart-level promo computes on eligible total',
  sessionDiscount === 380
);

const cartApplied = applyPromoToPriceLines(sessionLines, sessionPromo);
assert(
  'session checkout promo distributes across eligible lines',
  cartApplied.reduce((sum, line) => sum + line.discountedAmountCents, 0) ===
    3800 - sessionDiscount
);

const playerTrovePbOnly = applyPromoToPriceLines([pbVisionLine], freePbPromo);
assert(
  'PlayerTrove promo applies to upsell line item',
  playerTrovePbOnly[0].discountedAmountCents === 0
);

if (normalizeCheckoutEmail(' Promo@Test.COM ') === 'promo@test.com') {
  console.log('✓ promo checkout email normalization');
  passed += 1;
} else {
  console.error('✗ promo checkout email normalization');
  failed += 1;
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
