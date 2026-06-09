import { formatDuration } from '@/lib/format';

export const CLUB_TIME_ZONE = 'America/Chicago';
export const SHORT_CLIP_MAX_SECONDS = 5 * 60;

export type UpsellOffer = {
  product: string;
  label: string;
  price_cents: number;
  status: 'purchased' | 'available' | 'requires_video';
};

export type PlayerTroveVideo = {
  access_id: string;
  clip_id: string;
  clip_slug: string | null;
  clip_title: string | null;
  recorded_at: string | null;
  created_at: string | null;
  duration_seconds: number | null;
  booking_id: string | null;
  club_name: string | null;
  court_name: string | null;
  thumbnail_url: string | null;
  youtube_url: string | null;
  youtube_status: string;
  download_expires_at: string | null;
  pb_vision_expires_at: string | null;
  pb_vision_request_id: string | null;
  pb_vision_status: string | null;
  pb_vision_webpage_url: string | null;
  pb_vision_error_reason: string | null;
  coach_review_expires_at: string | null;
  pro_review_request_id: string | null;
  pro_review_status: string | null;
  pro_review_reviewer_link: string | null;
  pro_review_buyer_position: string | null;
  pro_review_identification_frame_s3_key: string | null;
  pro_review_identification_frame_url: string | null;
  purchased_at: string;
  upsell_offers: UpsellOffer[];
};

export type PlayerTroveApiResponse = {
  email: string;
  videos: PlayerTroveVideo[];
};

export function formatClipTime(recordedAt: string, timeZone = CLUB_TIME_ZONE) {
  return new Date(recordedAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  });
}

export function formatSessionDate(dateValue: string, timeZone = CLUB_TIME_ZONE) {
  return new Date(dateValue).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  });
}

export function getClipHeading(video: PlayerTroveVideo) {
  const durationLabel = video.duration_seconds
    ? ` | ${formatDuration(video.duration_seconds)}`
    : '';

  if (video.recorded_at) {
    return `${formatClipTime(video.recorded_at)}${durationLabel}`;
  }

  return durationLabel ? `Clip${durationLabel}` : 'Clip';
}

export function getClipLocationLine(video: PlayerTroveVideo) {
  const parts = [video.club_name, video.court_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function getClipDateLine(video: PlayerTroveVideo) {
  const dateSource = video.recorded_at ?? video.created_at;
  if (!dateSource) {
    return null;
  }

  return formatSessionDate(dateSource);
}

export function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function getOffer(video: PlayerTroveVideo, product: string) {
  return video.upsell_offers.find((offer) => offer.product === product);
}

export function hasPurchasedBaseAccess(video: PlayerTroveVideo) {
  const baseOffer = video.upsell_offers.find(
    (offer) => offer.product === 'clip_download' || offer.product === 'full_game_hd'
  );
  return baseOffer?.status === 'purchased';
}

export function getUpsellStatusStyle(status: UpsellOffer['status']) {
  switch (status) {
    case 'purchased':
      return { color: '#198754', background: '#e8f5e9' };
    case 'available':
      return { color: '#0d6efd', background: '#e7f1ff' };
    case 'requires_video':
      return { color: '#6c757d', background: '#f1f3f5' };
  }
}

export function getUpsellStatusLabel(status: UpsellOffer['status']) {
  switch (status) {
    case 'purchased':
      return 'Purchased';
    case 'available':
      return 'Available to purchase';
    case 'requires_video':
      return 'Requires video purchase';
  }
}

export function isShortClip(video: PlayerTroveVideo) {
  if (video.duration_seconds == null) {
    return true;
  }

  return video.duration_seconds < SHORT_CLIP_MAX_SECONDS;
}

export function isFullGameClip(video: PlayerTroveVideo) {
  return video.duration_seconds != null && video.duration_seconds >= SHORT_CLIP_MAX_SECONDS;
}

export function formatClaimedDate(purchasedAt: string, timeZone = CLUB_TIME_ZONE) {
  return new Date(purchasedAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  });
}

export function formatDownloadExpiry(
  downloadExpiresAt: string | null,
  timeZone = CLUB_TIME_ZONE
) {
  if (!downloadExpiresAt) {
    return null;
  }

  return new Date(downloadExpiresAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  });
}

export function canDownloadHd(video: PlayerTroveVideo, now: Date) {
  if (!hasPurchasedBaseAccess(video)) {
    return false;
  }

  if (!video.download_expires_at) {
    return false;
  }

  return new Date(video.download_expires_at) >= now;
}
