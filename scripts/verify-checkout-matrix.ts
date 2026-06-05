/**
 * Phase 3 checkout QA matrix — run with: npx tsx scripts/verify-checkout-matrix.ts
 */
import {
  getBillableNormalizedLines,
  isBillableStripeLine,
  normalizeCheckoutCart,
  type ClipCartContext,
  type ParsedCheckoutCart,
} from '../lib/commerce/cart-normalize';
import {
  addAllClipsBaseToCart,
  emptyCartPayload,
  type SessionClipPricingClient,
} from '../lib/commerce/cart-payload';
import {
  normalizeCheckoutEmail,
  validateProductNotAlreadyPurchased,
} from '../lib/commerce/purchase-validation';
import { getVideoBaseAccessDenialReason } from '../lib/commerce/entitlements';

type TestCase = {
  name: string;
  parsed: ParsedCheckoutCart;
  clips: ClipCartContext[];
  sessionClips: ClipCartContext[];
  expectedBillableProducts: Array<{ clipId: string; productType: string }>;
  expectedBundleBaseCount: number;
};

const clipA: ClipCartContext = {
  id: 'clip-a',
  booking_id: 'booking-1',
  duration_seconds: 120,
  club_id: 'club-1',
  court_id: 'court-1',
};

const clipB: ClipCartContext = {
  id: 'clip-b',
  booking_id: 'booking-1',
  duration_seconds: 400,
  club_id: 'club-1',
  court_id: 'court-1',
};

const clipC: ClipCartContext = {
  id: 'clip-c',
  booking_id: 'booking-1',
  duration_seconds: 90,
  club_id: 'club-1',
  court_id: 'court-1',
};

const sessionClips = [clipA, clipB, clipC];

const cases: TestCase[] = [
  {
    name: 'bundle only',
    parsed: {
      version: 1,
      bookingId: 'booking-1',
      sessionBundle: true,
      lines: [],
      legacyClipIds: [],
      source: 'cartJson',
    },
    clips: sessionClips,
    sessionClips,
    expectedBillableProducts: [],
    expectedBundleBaseCount: 3,
  },
  {
    name: 'bundle + PB Vision',
    parsed: {
      version: 1,
      bookingId: 'booking-1',
      sessionBundle: true,
      lines: [{ clipId: 'clip-b', products: ['pb_vision'] }],
      legacyClipIds: [],
      source: 'cartJson',
    },
    clips: sessionClips,
    sessionClips,
    expectedBillableProducts: [{ clipId: 'clip-b', productType: 'pb_vision' }],
    expectedBundleBaseCount: 3,
  },
  {
    name: 'bundle + Coach Review',
    parsed: {
      version: 1,
      bookingId: 'booking-1',
      sessionBundle: true,
      lines: [{ clipId: 'clip-b', products: ['coach_review'] }],
      legacyClipIds: [],
      source: 'cartJson',
    },
    clips: sessionClips,
    sessionClips,
    expectedBillableProducts: [{ clipId: 'clip-b', productType: 'coach_review' }],
    expectedBundleBaseCount: 3,
  },
  {
    name: 'mixed free/paid session clips (bundle)',
    parsed: {
      version: 1,
      bookingId: 'booking-1',
      sessionBundle: true,
      lines: [],
      legacyClipIds: [],
      source: 'cartJson',
    },
    clips: sessionClips,
    sessionClips,
    expectedBillableProducts: [],
    expectedBundleBaseCount: 3,
  },
  {
    name: 'legacy single full-game clip',
    parsed: {
      version: 0,
      bookingId: 'booking-1',
      sessionBundle: false,
      lines: [],
      legacyClipIds: ['clip-b'],
      source: 'legacy_clipIds',
    },
    clips: [clipB],
    sessionClips: [],
    expectedBillableProducts: [{ clipId: 'clip-b', productType: 'full_game_hd' }],
    expectedBundleBaseCount: 0,
  },
];

let passed = 0;
let failed = 0;

for (const testCase of cases) {
  const normalized = normalizeCheckoutCart({
    parsed: testCase.parsed,
    clips: testCase.clips,
    sessionClips: testCase.sessionClips,
  });

  const bundleBaseLines = normalized.lines.filter((line) => line.coveredBySessionBundle);
  const billable = getBillableNormalizedLines(normalized).map((line) => ({
    clipId: line.clipId,
    productType: line.productType,
  }));

  const bundleBaseOk = bundleBaseLines.length === testCase.expectedBundleBaseCount;
  const billableOk =
    JSON.stringify(billable) === JSON.stringify(testCase.expectedBillableProducts);

  const zeroDollarBundleBasesInBillable = billable.some(
    (line) =>
      normalized.lines.find(
        (normalizedLine) =>
          normalizedLine.clipId === line.clipId &&
          normalizedLine.productType === line.productType
      )?.coveredBySessionBundle &&
      (line.productType === 'clip_download' || line.productType === 'full_game_hd')
  );

  if (bundleBaseOk && billableOk && !zeroDollarBundleBasesInBillable) {
    console.log(`✓ ${testCase.name}`);
    passed += 1;
  } else {
    console.error(`✗ ${testCase.name}`);
    console.error('  expected billable:', testCase.expectedBillableProducts);
    console.error('  actual billable:', billable);
    console.error('  expected bundle bases:', testCase.expectedBundleBaseCount);
    console.error('  actual bundle bases:', bundleBaseLines.length);
    failed += 1;
  }
}

// isBillableStripeLine unit checks
const bundleBaseLine = {
  clipId: 'clip-a',
  productType: 'clip_download' as const,
  coveredBySessionBundle: true,
};
const addonLine = {
  clipId: 'clip-b',
  productType: 'pb_vision' as const,
  coveredBySessionBundle: false,
};

if (!isBillableStripeLine(bundleBaseLine) && isBillableStripeLine(addonLine)) {
  console.log('✓ isBillableStripeLine guards');
  passed += 1;
} else {
  console.error('✗ isBillableStripeLine guards');
  failed += 1;
}

const pricingClips: SessionClipPricingClient[] = [
  {
    id: 'clip-a',
    baseProduct: 'clip_download',
    basePriceCents: 500,
    pbVisionPriceCents: 0,
    coachReviewPriceCents: 0,
    isFullGame: false,
    duration_seconds: 120,
  },
  {
    id: 'clip-b',
    baseProduct: 'full_game_hd',
    basePriceCents: 1500,
    pbVisionPriceCents: 800,
    coachReviewPriceCents: 600,
    isFullGame: true,
    duration_seconds: 400,
  },
];

const bundleCart = {
  ...emptyCartPayload('booking-1'),
  sessionBundle: true,
  lines: [{ clipId: 'clip-b', products: ['pb_vision' as const] }],
};
const addAllResult = addAllClipsBaseToCart(bundleCart, pricingClips);

if (
  !addAllResult.sessionBundle &&
  addAllResult.lines.length === 2 &&
  addAllResult.lines.every((line) => line.products.length === 1)
) {
  console.log('✓ addAllClipsBaseToCart clears bundle and adds all bases');
  passed += 1;
} else {
  console.error('✗ addAllClipsBaseToCart clears bundle and adds all bases');
  failed += 1;
}

const futureExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

if (normalizeCheckoutEmail('  Player@Example.COM ') === 'player@example.com') {
  console.log('✓ normalizeCheckoutEmail canonicalizes case and whitespace');
  passed += 1;
} else {
  console.error('✗ normalizeCheckoutEmail canonicalizes case and whitespace');
  failed += 1;
}

const activeHdAccess = {
  hd_download_purchased_at: futureExpiry,
  download_expires_at: futureExpiry,
};

if (
  validateProductNotAlreadyPurchased(activeHdAccess, { duration_seconds: 400 }, 'full_game_hd')
    .ok === false
) {
  console.log('✓ duplicate HD purchase rejected');
  passed += 1;
} else {
  console.error('✗ duplicate HD purchase rejected');
  failed += 1;
}

const expiredHdAccess = {
  hd_download_purchased_at: pastExpiry,
  download_expires_at: pastExpiry,
};

if (
  validateProductNotAlreadyPurchased(expiredHdAccess, { duration_seconds: 400 }, 'full_game_hd')
    .ok === true
) {
  console.log('✓ expired HD purchase allowed to repurchase');
  passed += 1;
} else {
  console.error('✗ expired HD purchase allowed to repurchase');
  failed += 1;
}

if (
  getVideoBaseAccessDenialReason(expiredHdAccess, { duration_seconds: 400 }) ===
  'expired'
) {
  console.log('✓ expired download distinguished from never purchased');
  passed += 1;
} else {
  console.error('✗ expired download distinguished from never purchased');
  failed += 1;
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
