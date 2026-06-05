import {
  isFullGameClip,
  resolveBaseProductForClip,
  type BaseProductType,
} from '@/lib/commerce/products';
import { resolveProductPrice } from '@/lib/pricing';

type SessionClipInput = {
  id: string;
  club_id: string | null;
  court_id: string | null;
  price_cents: number | null;
  duration_seconds: number | null;
  recorded_at?: string | null;
  created_at?: string | null;
};

type BookingInput = {
  start_time: string | null;
  end_time: string | null;
} | null;

export type SessionClipPricing = {
  id: string;
  baseProduct: BaseProductType;
  basePriceCents: number;
  pbVisionPriceCents: number;
  coachReviewPriceCents: number;
  isFullGame: boolean;
  duration_seconds: number | null;
};

export type SessionBundleQuote = {
  showBundle: boolean;
  billedHours: number;
  hourlyRateCents: number;
  bundlePriceCents: number;
  individualSumCents: number;
  savingsCents: number;
  eligibleClipIds: string[];
};

const MS_PER_HOUR = 60 * 60 * 1000;

export function computeSessionDurationHours(
  booking: BookingInput,
  clips: SessionClipInput[]
) {
  if (booking?.start_time && booking?.end_time) {
    const startMs = Date.parse(booking.start_time);
    const endMs = Date.parse(booking.end_time);

    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
      const hours = (endMs - startMs) / MS_PER_HOUR;
      return Math.max(1, Math.ceil(hours));
    }
  }

  const timestamps = clips
    .map((clip) => clip.recorded_at ?? clip.created_at)
    .filter(Boolean)
    .map((value) => Date.parse(value as string))
    .filter((value) => !Number.isNaN(value));

  if (timestamps.length >= 2) {
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    const hours = (max - min) / MS_PER_HOUR;
    return Math.max(1, Math.ceil(hours));
  }

  return 1;
}

export async function resolveSessionClipPricing(
  clip: SessionClipInput
): Promise<SessionClipPricing> {
  const baseProduct = resolveBaseProductForClip(clip);
  const clubId = clip.club_id;
  const courtId = clip.court_id;

  const [basePrice, pbVisionPrice, coachReviewPrice] = await Promise.all([
    resolveProductPrice({
      productType: baseProduct,
      clubId,
      courtId,
      fallbackPriceCents: clip.price_cents,
    }),
    resolveProductPrice({
      productType: 'pb_vision',
      clubId,
      courtId,
    }),
    resolveProductPrice({
      productType: 'coach_review',
      clubId,
      courtId,
    }),
  ]);

  return {
    id: clip.id,
    baseProduct,
    basePriceCents: basePrice.priceCents,
    pbVisionPriceCents: pbVisionPrice.priceCents,
    coachReviewPriceCents: coachReviewPrice.priceCents,
    isFullGame: isFullGameClip(clip),
    duration_seconds: clip.duration_seconds,
  };
}

export async function resolveSessionClipPricingList(clips: SessionClipInput[]) {
  return Promise.all(clips.map((clip) => resolveSessionClipPricing(clip)));
}

export async function resolveSessionBundleQuote({
  clips,
  booking,
  clubId,
  courtId,
}: {
  clips: SessionClipInput[];
  booking: BookingInput;
  clubId: string | null;
  courtId: string | null;
}): Promise<SessionBundleQuote> {
  const pricedClips = await resolveSessionClipPricingList(clips);

  const eligible = pricedClips.filter((clip) => clip.basePriceCents > 0);
  const individualSumCents = eligible.reduce(
    (sum, clip) => sum + clip.basePriceCents,
    0
  );

  const billedHours = computeSessionDurationHours(booking, clips);

  const hourlyRate = await resolveProductPrice({
    productType: 'session_bundle',
    clubId,
    courtId,
  });

  const hourlyRateCents = hourlyRate.priceCents;
  const bundlePriceCents = billedHours * hourlyRateCents;
  const savingsCents = Math.max(0, individualSumCents - bundlePriceCents);

  const showBundle =
    eligible.length > 0 &&
    hourlyRateCents > 0 &&
    individualSumCents > bundlePriceCents;

  return {
    showBundle,
    billedHours,
    hourlyRateCents,
    bundlePriceCents,
    individualSumCents,
    savingsCents,
    eligibleClipIds: eligible.map((clip) => clip.id),
  };
}
