/**
 * PlayerTrove upsell QA — run with: npx tsx scripts/verify-player-trove-upsell.ts
 */
import {
  buildUpsellCartPayload,
  resolveUpsellOffers,
  validateUpsellPurchaseRequest,
} from '../lib/commerce/player-trove-upsell';

const futureExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

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

const shortClip = { duration_seconds: 120 };
const fullGameClip = { duration_seconds: 400 };
const pricing = {
  basePriceCents: 500,
  pbVisionPriceCents: 800,
  coachReviewPriceCents: 600,
};

const noAccess = {};
const shortClipPurchased = {
  clip_download_purchased_at: futureExpiry,
  download_expires_at: futureExpiry,
};
const hdPurchased = {
  hd_download_purchased_at: futureExpiry,
  download_expires_at: futureExpiry,
};
const hdAndPbVision = {
  ...hdPurchased,
  pb_vision_purchased_at: futureExpiry,
  pb_vision_expires_at: futureExpiry,
};

assert(
  'short clip offers clip_download only',
  resolveUpsellOffers(noAccess, shortClip, pricing).length === 1 &&
    resolveUpsellOffers(noAccess, shortClip, pricing)[0].product === 'clip_download'
);

assert(
  'full game offers HD + addons',
  resolveUpsellOffers(noAccess, fullGameClip, pricing).length === 3
);

const fullGameOffers = resolveUpsellOffers(hdPurchased, fullGameClip, pricing);
assert(
  'HD purchased unlocks addon availability',
  fullGameOffers.find((o) => o.product === 'pb_vision')?.status === 'available'
);

assert(
  'addons require video when HD missing',
  resolveUpsellOffers(noAccess, fullGameClip, pricing).find(
    (o) => o.product === 'pb_vision'
  )?.status === 'requires_video'
);

assert(
  'purchased products hidden from available status',
  resolveUpsellOffers(hdAndPbVision, fullGameClip, pricing).find(
    (o) => o.product === 'pb_vision'
  )?.status === 'purchased'
);

assert(
  'reject duplicate clip_download purchase',
  validateUpsellPurchaseRequest(shortClipPurchased, shortClip, ['clip_download']).ok === false
);

assert(
  'reject addon without HD in same transaction',
  validateUpsellPurchaseRequest(noAccess, fullGameClip, ['pb_vision']).ok === false
);

assert(
  'allow HD + PB Vision in same transaction',
  validateUpsellPurchaseRequest(noAccess, fullGameClip, ['full_game_hd', 'pb_vision']).ok ===
    true
);

assert(
  'allow addon when HD already owned',
  validateUpsellPurchaseRequest(hdPurchased, fullGameClip, ['coach_review']).ok === true
);

const cart = buildUpsellCartPayload('clip-1', 'booking-1', ['full_game_hd', 'pb_vision']);
assert(
  'upsell cart payload is structured single-line cart',
  cart.sessionBundle === false &&
    cart.lines.length === 1 &&
    cart.lines[0].products.length === 2
);

assert(
  'expired entitlement treated as not purchased',
  resolveUpsellOffers(
    {
      clip_download_purchased_at: pastExpiry,
      download_expires_at: pastExpiry,
    },
    shortClip,
    pricing
  )[0].status === 'available'
);

assert(
  'pb vision purchased_at without expires_at is treated as purchased',
  resolveUpsellOffers(
    {
      ...hdPurchased,
      pb_vision_purchased_at: futureExpiry,
      pb_vision_expires_at: null,
    },
    fullGameClip,
    pricing
  ).find((offer) => offer.product === 'pb_vision')?.status === 'purchased'
);

assert(
  'active pb vision request implies purchased when entitlement fields are stale',
  resolveUpsellOffers(
    hdPurchased,
    fullGameClip,
    pricing,
    {
      pbVisionRequest: {
        status: 'processing',
        refund_status: null,
      },
    }
  ).find((offer) => offer.product === 'pb_vision')?.status === 'purchased'
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
