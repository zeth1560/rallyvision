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
  pb_vision_refund_status: string | null;
  pb_vision_submission_attempt_count: number;
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

export function formatClipRecordedAt(recordedAt: string, timeZone = CLUB_TIME_ZONE) {
  return `${formatSessionDate(recordedAt, timeZone)} at ${formatClipTime(recordedAt, timeZone)}`;
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

export function isPbVisionExpired(video: PlayerTroveVideo, now: Date) {
  return !video.pb_vision_expires_at || new Date(video.pb_vision_expires_at) < now;
}

export function isPbVisionProcessing(status: string | null) {
  return status === 'requested' || status === 'submitted' || status === 'processing';
}

export const MAX_PB_VISION_SUBMISSION_ATTEMPTS = 3;

export function hasPurchasedPbVision(video: PlayerTroveVideo) {
  return getOffer(video, 'pb_vision')?.status === 'purchased';
}

export function canPurchasePbVision(video: PlayerTroveVideo) {
  return getOffer(video, 'pb_vision')?.status === 'available';
}

export function hasPbVisionRefund(
  video: Pick<PlayerTroveVideo, 'pb_vision_refund_status'>
) {
  return (
    video.pb_vision_refund_status === 'completed' ||
    video.pb_vision_refund_status === 'skipped_free'
  );
}

export function isPbVisionAutoRetryPending(
  video: Pick<
    PlayerTroveVideo,
    | 'pb_vision_refund_status'
    | 'pb_vision_status'
    | 'pb_vision_submission_attempt_count'
  >
) {
  if (hasPbVisionRefund(video)) {
    return false;
  }

  if (video.pb_vision_status !== 'failed') {
    return false;
  }

  return (
    video.pb_vision_submission_attempt_count < MAX_PB_VISION_SUBMISSION_ATTEMPTS
  );
}

export function getPbVisionAvailabilityLabel(video: PlayerTroveVideo, now: Date) {
  const offer = getOffer(video, 'pb_vision');

  if (hasPbVisionRefund(video)) {
    return 'Refunded — analysis unavailable';
  }

  if (isPbVisionAutoRetryPending(video)) {
    return `Retrying automatically (attempt ${Math.max(video.pb_vision_submission_attempt_count, 1)} of ${MAX_PB_VISION_SUBMISSION_ATTEMPTS})`;
  }

  if (offer?.status === 'requires_video') {
    return 'Requires video purchase';
  }

  if (offer?.status !== 'purchased') {
    return 'Available to purchase';
  }

  if (isPbVisionExpired(video, now)) {
    return 'PB Vision access expired';
  }

  if (!video.pb_vision_status) {
    return 'Purchased — ready for analysis';
  }

  if (isPbVisionProcessing(video.pb_vision_status)) {
    return 'Analysis in progress';
  }

  if (video.pb_vision_status === 'completed') {
    return 'Analysis complete';
  }

  if (video.pb_vision_status === 'failed') {
    return 'Analysis failed';
  }

  return 'Purchased';
}

export function getPbVisionActionLabel(video: PlayerTroveVideo, now: Date) {
  if (hasPbVisionRefund(video)) {
    return 'Purchase PB Vision again';
  }

  if (isPbVisionAutoRetryPending(video)) {
    return 'Retrying automatically';
  }

  if (isPbVisionExpired(video, now)) {
    return 'PB Vision Expired';
  }

  if (!video.pb_vision_status) {
    return 'Send to PB Vision';
  }

  if (isPbVisionProcessing(video.pb_vision_status)) {
    return 'PB Vision Processing';
  }

  if (video.pb_vision_status === 'completed' && video.pb_vision_webpage_url) {
    return 'View PB Vision Results';
  }

  if (video.pb_vision_status === 'failed') {
    return 'Retry PB Vision';
  }

  return 'Send to PB Vision';
}
