'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import { COACH_REVIEW_CUSTOMER_ENABLED, YOUTUBE_CUSTOMER_ENABLED } from '@/lib/commerce/products';
import { formatDuration } from '@/lib/format';
import {
  hasPbVisionRefund,
  isPbVisionAutoRetryPending,
  isPbVisionAwaitingAutoSubmit,
  isPbVisionProcessing,
} from '@/lib/player-trove-display';

const ProReviewRequestModal = dynamic(
  () => import('@/app/player-trove/ProReviewRequestModal'),
  { ssr: false }
);

const CLUB_TIME_ZONE = 'America/Chicago';
const SHORT_CLIP_MAX_SECONDS = 5 * 60;

type UpsellOffer = {
  product: string;
  label: string;
  price_cents: number;
  status: 'purchased' | 'available' | 'requires_video';
};

type Video = {
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

type ApiResponse = {
  email: string;
  videos: Video[];
};

function formatClipTime(recordedAt: string, timeZone = CLUB_TIME_ZONE) {
  return new Date(recordedAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  });
}

function formatSessionDate(dateValue: string, timeZone = CLUB_TIME_ZONE) {
  return new Date(dateValue).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  });
}

function getClipHeading(video: Video) {
  const durationLabel = video.duration_seconds
    ? ` | ${formatDuration(video.duration_seconds)}`
    : '';

  if (video.recorded_at) {
    return `${formatClipTime(video.recorded_at)}${durationLabel}`;
  }

  return durationLabel ? `Clip${durationLabel}` : 'Clip';
}

function getClipLocationLine(video: Video) {
  const parts = [video.club_name, video.court_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function getClipDateLine(video: Video) {
  const dateSource = video.recorded_at ?? video.created_at;
  if (!dateSource) {
    return null;
  }

  return formatSessionDate(dateSource);
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function getOffer(video: Video, product: string) {
  return video.upsell_offers.find((offer) => offer.product === product);
}

function hasPurchasedBaseAccess(video: Video) {
  const baseOffer = video.upsell_offers.find(
    (offer) => offer.product === 'clip_download' || offer.product === 'full_game_hd'
  );
  return baseOffer?.status === 'purchased';
}

function getUpsellStatusStyle(status: UpsellOffer['status']) {
  switch (status) {
    case 'purchased':
      return { color: '#198754', background: '#e8f5e9' };
    case 'available':
      return { color: '#0d6efd', background: '#e7f1ff' };
    case 'requires_video':
      return { color: '#6c757d', background: '#f1f3f5' };
  }
}

function getUpsellStatusLabel(status: UpsellOffer['status']) {
  switch (status) {
    case 'purchased':
      return 'Purchased';
    case 'available':
      return 'Available to purchase';
    case 'requires_video':
      return 'Requires video purchase';
  }
}

function isShortClip(video: Video) {
  if (video.duration_seconds == null) {
    return true;
  }

  return video.duration_seconds < SHORT_CLIP_MAX_SECONDS;
}

function isFullGameClip(video: Video) {
  return video.duration_seconds != null && video.duration_seconds >= SHORT_CLIP_MAX_SECONDS;
}

function isPbVisionExpired(video: Video, now: Date) {
  return !video.pb_vision_expires_at || new Date(video.pb_vision_expires_at) < now;
}

function getPbVisionButtonLabel(video: Video, now: Date) {
  if (hasPbVisionRefund(video)) {
    return 'Refunded';
  }

  if (isPbVisionAutoRetryPending(video)) {
    return 'Retrying automatically';
  }

  if (isPbVisionAwaitingAutoSubmit(video)) {
    return 'Submitting automatically';
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
    return 'PB Vision Failed';
  }

  return 'Send to PB Vision';
}

function getProReviewButtonLabel(video: Video, now: Date) {
  const coachReviewOffer = video.upsell_offers.find(
    (offer) => offer.product === 'coach_review'
  );
  const purchased = coachReviewOffer?.status === 'purchased';
  const expired =
    purchased &&
    (!video.coach_review_expires_at || new Date(video.coach_review_expires_at) < now);

  if (expired) {
    return 'Pro Review Expired';
  }

  if (!video.pro_review_status) {
    return 'Request Pro Review';
  }

  if (video.pro_review_status === 'requested') {
    return 'Continue Pro Review Request';
  }

  if (
    video.pro_review_status === 'ready_for_reviewer' ||
    video.pro_review_status === 'in_review'
  ) {
    return 'Pro Review Requested';
  }

  if (video.pro_review_status === 'completed' && video.pro_review_reviewer_link) {
    return 'View Pro Review';
  }

  if (video.pro_review_status === 'failed') {
    return 'Pro Review Failed';
  }

  return 'Request Pro Review';
}

function isProReviewActionable(video: Video, now: Date) {
  const coachReviewOffer = video.upsell_offers.find(
    (offer) => offer.product === 'coach_review'
  );
  const purchased = coachReviewOffer?.status === 'purchased';
  const expired =
    purchased &&
    (!video.coach_review_expires_at || new Date(video.coach_review_expires_at) < now);

  if (!purchased || expired) {
    return false;
  }

  if (!video.pro_review_status) {
    return true;
  }

  if (video.pro_review_status === 'requested') {
    return true;
  }

  if (video.pro_review_status === 'completed' && video.pro_review_reviewer_link) {
    return true;
  }

  return false;
}

type VideoCardProps = {
  video: Video;
  now: Date;
  showAdvancedActions: boolean;
  downloadingAccessId: string | null;
  downloadError: string | undefined;
  onDownload: (accessId: string) => void;
  pbVisionLoadingAccessId: string | null;
  pbVisionError: string | undefined;
  onPbVision: (video: Video) => void;
  proReviewLoadingAccessId: string | null;
  proReviewError: string | undefined;
  onProReview: (video: Video) => void;
  purchaseLoadingKey: string | null;
  purchaseError: string | undefined;
  onPurchase: (accessId: string, products: string[]) => void;
};

function VideoCard({
  video,
  now,
  showAdvancedActions,
  downloadingAccessId,
  downloadError,
  onDownload,
  pbVisionLoadingAccessId,
  pbVisionError,
  onPbVision,
  proReviewLoadingAccessId,
  proReviewError,
  onProReview,
  purchaseLoadingKey,
  purchaseError,
  onPurchase,
}: VideoCardProps) {
  const baseAccess = hasPurchasedBaseAccess(video);
  const downloadExpired =
    baseAccess &&
    (!video.download_expires_at || new Date(video.download_expires_at) < now);
  const pbVisionOffer = getOffer(video, 'pb_vision');
  const coachReviewOffer = getOffer(video, 'coach_review');
  const pbVisionPurchased = pbVisionOffer?.status === 'purchased';
  const coachReviewPurchased = coachReviewOffer?.status === 'purchased';
  const pbVisionExpired = pbVisionPurchased && isPbVisionExpired(video, now);
  const coachReviewExpired =
    coachReviewPurchased &&
    (!video.coach_review_expires_at || new Date(video.coach_review_expires_at) < now);
  const youtubeReady = video.youtube_url && video.youtube_status === 'ready';
  const isDownloading = downloadingAccessId === video.access_id;
  const isPbVisionLoading = pbVisionLoadingAccessId === video.access_id;
  const pbVisionLabel = getPbVisionButtonLabel(video, now);
  const pbVisionFailed = video.pb_vision_status === 'failed';
  const pbVisionCompleted =
    video.pb_vision_status === 'completed' && Boolean(video.pb_vision_webpage_url);
  const pbVisionRefunded = hasPbVisionRefund(video);
  const pbVisionAutoRetry = isPbVisionAutoRetryPending(video);
  const pbVisionAwaitingAutoSubmit = isPbVisionAwaitingAutoSubmit(video);
  const pbVisionBusy =
    isPbVisionLoading || isPbVisionProcessing(video.pb_vision_status);
  const pbVisionDisabled =
    !pbVisionPurchased ||
    pbVisionExpired ||
    pbVisionBusy ||
    pbVisionRefunded ||
    pbVisionAutoRetry ||
    pbVisionAwaitingAutoSubmit;
  const proReviewLabel = getProReviewButtonLabel(video, now);
  const proReviewFailed = video.pro_review_status === 'failed';
  const proReviewSubmitted =
    video.pro_review_status === 'ready_for_reviewer' ||
    video.pro_review_status === 'in_review';
  const proReviewCompleted =
    video.pro_review_status === 'completed' && Boolean(video.pro_review_reviewer_link);
  const isProReviewLoading = proReviewLoadingAccessId === video.access_id;
  const proReviewDisabled =
    !isProReviewActionable(video, now) || isProReviewLoading || proReviewSubmitted;
  const heading = getClipHeading(video);
  const locationLine = getClipLocationLine(video);
  const dateLine = getClipDateLine(video);

  return (
    <div
      style={{
        border: '1px solid #dedede',
        borderRadius: '16px',
        padding: '18px',
        background: '#ffffff',
        boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          borderRadius: '10px',
          overflow: 'hidden',
          background: '#f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666',
          fontSize: '12px',
          marginBottom: '14px',
        }}
      >
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={`Thumbnail for ${heading}`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          'No Thumbnail'
        )}
      </div>

      <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>{heading}</h3>

      {locationLine ? (
        <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>{locationLine}</p>
      ) : null}

      {dateLine ? (
        <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
          Session date: {dateLine}
        </p>
      ) : null}

      <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
        Claimed: {formatSessionDate(video.purchased_at)}
      </p>

      <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
        {baseAccess
          ? downloadExpired
            ? 'HD download expired'
            : video.download_expires_at
              ? `HD download until ${formatSessionDate(video.download_expires_at)}`
              : 'HD download available'
          : 'HD download requires purchase'}
      </p>

      {video.upsell_offers.length > 0 ? (
        <div
          style={{
            marginTop: '12px',
            padding: '12px',
            borderRadius: '10px',
            background: '#f8f9fa',
            border: '1px solid #e9ecef',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              marginBottom: '8px',
              color: '#333',
            }}
          >
            Products
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
            {video.upsell_offers.map((offer) => {
              const isCoachReviewComingSoon =
                offer.product === 'coach_review' && !COACH_REVIEW_CUSTOMER_ENABLED;
              const statusStyle = isCoachReviewComingSoon
                ? { color: '#6c757d', background: '#e9ecef' }
                : getUpsellStatusStyle(offer.status);
              const statusLabel = isCoachReviewComingSoon
                ? 'Coming soon'
                : getUpsellStatusLabel(offer.status);
              const loadingKey = `${video.access_id}:${offer.product}`;
              const isLoading = purchaseLoadingKey === loadingKey;
              const canPurchase =
                offer.status === 'available' && !isCoachReviewComingSoon;

              return (
                <li
                  key={offer.product}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{offer.label}</div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {isCoachReviewComingSoon
                        ? 'Available soon'
                        : offer.status === 'available'
                          ? formatCents(offer.price_cents)
                          : statusLabel}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '4px 8px',
                        borderRadius: '999px',
                        ...statusStyle,
                      }}
                    >
                      {statusLabel}
                    </span>
                    {canPurchase ? (
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => onPurchase(video.access_id, [offer.product])}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: 'none',
                          background: '#111111',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          opacity: isLoading ? 0.65 : 1,
                        }}
                      >
                        {isLoading ? 'Starting...' : 'Purchase'}
                      </button>
                    ) : isCoachReviewComingSoon ? (
                      <button
                        type="button"
                        disabled
                        style={{
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: 'none',
                          background: '#ccc',
                          color: '#666',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'not-allowed',
                        }}
                      >
                        Coming soon
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
        {video.booking_id ? (
          <Link
            href={`/session/${video.booking_id}`}
            style={{ color: '#007bff', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}
          >
            View session
          </Link>
        ) : null}
        {video.clip_slug ? (
          <Link
            href={`/clip/${video.clip_slug}`}
            style={{ color: '#007bff', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}
          >
            Preview
          </Link>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginTop: 'auto',
          paddingTop: '16px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          disabled={!YOUTUBE_CUSTOMER_ENABLED || !youtubeReady}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: 'none',
            background:
              YOUTUBE_CUSTOMER_ENABLED && youtubeReady ? '#ff0000' : '#ccc',
            color: YOUTUBE_CUSTOMER_ENABLED && youtubeReady ? 'white' : '#666',
            cursor:
              YOUTUBE_CUSTOMER_ENABLED && youtubeReady ? 'pointer' : 'not-allowed',
            fontSize: '13px',
          }}
          onClick={() => {
            if (YOUTUBE_CUSTOMER_ENABLED && youtubeReady) {
              window.open(video.youtube_url!, '_blank');
            }
          }}
        >
          {!YOUTUBE_CUSTOMER_ENABLED
            ? 'YouTube (Coming soon)'
            : youtubeReady
              ? 'YouTube'
              : 'YouTube N/A'}
        </button>

        <button
          disabled={!baseAccess || downloadExpired || isDownloading}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: 'none',
            background: !baseAccess || downloadExpired ? '#ccc' : '#007bff',
            color: 'white',
            cursor: !baseAccess || downloadExpired || isDownloading ? 'not-allowed' : 'pointer',
            opacity: isDownloading ? 0.6 : 1,
            fontSize: '13px',
          }}
          onClick={() => baseAccess && !downloadExpired && onDownload(video.access_id)}
        >
          {!baseAccess
            ? 'Download Locked'
            : downloadExpired
              ? 'Download Expired'
              : isDownloading
                ? 'Preparing...'
                : 'Download HD'}
        </button>

        {showAdvancedActions && pbVisionPurchased ? (
            <button
              disabled={pbVisionDisabled}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                background: pbVisionExpired
                  ? '#ccc'
                  : pbVisionFailed
                    ? '#dc3545'
                    : pbVisionCompleted
                      ? '#17a2b8'
                      : '#28a745',
                color: 'white',
                cursor: pbVisionDisabled ? 'not-allowed' : 'pointer',
                opacity: isPbVisionLoading ? 0.6 : 1,
                fontSize: '13px',
              }}
              onClick={() => {
                if (pbVisionExpired || pbVisionBusy) {
                  return;
                }
                if (pbVisionCompleted && video.pb_vision_webpage_url) {
                  window.open(video.pb_vision_webpage_url, '_blank');
                  return;
                }
                onPbVision(video);
              }}
            >
              {isPbVisionLoading ? 'Submitting...' : pbVisionLabel}
            </button>
        ) : null}

        {showAdvancedActions && !COACH_REVIEW_CUSTOMER_ENABLED ? (
          <button
            type="button"
            disabled
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: '#ccc',
              color: '#666',
              cursor: 'not-allowed',
              fontSize: '13px',
            }}
          >
            Pro Review (Coming soon)
          </button>
        ) : showAdvancedActions && coachReviewPurchased ? (
          <button
            disabled={proReviewDisabled}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: coachReviewExpired
                ? '#ccc'
                : proReviewFailed
                  ? '#dc3545'
                  : proReviewCompleted
                    ? '#17a2b8'
                    : proReviewSubmitted
                      ? '#6c757d'
                      : '#ffc107',
              color: coachReviewExpired || proReviewSubmitted ? 'white' : 'black',
              cursor: proReviewDisabled ? 'not-allowed' : 'pointer',
              opacity: isProReviewLoading ? 0.6 : 1,
              fontSize: '13px',
            }}
            onClick={() => {
              if (coachReviewExpired || proReviewSubmitted || isProReviewLoading) {
                return;
              }
              if (proReviewCompleted && video.pro_review_reviewer_link) {
                window.open(video.pro_review_reviewer_link, '_blank');
                return;
              }
              onProReview(video);
            }}
          >
            {isProReviewLoading ? 'Loading...' : proReviewLabel}
          </button>
        ) : null}
      </div>

      {purchaseError ? (
        <p
          style={{
            margin: '10px 0 0',
            color: '#b00020',
            fontSize: '13px',
            lineHeight: 1.4,
          }}
          role="alert"
        >
          {purchaseError}
        </p>
      ) : null}

      {downloadError ? (
        <p
          style={{
            margin: '10px 0 0',
            color: '#b00020',
            fontSize: '13px',
            lineHeight: 1.4,
          }}
          role="alert"
        >
          {downloadError}
        </p>
      ) : null}

      {pbVisionFailed && video.pb_vision_error_reason ? (
        <p
          style={{
            margin: '8px 0 0',
            color: '#b00020',
            fontSize: '13px',
            lineHeight: 1.4,
          }}
        >
          {video.pb_vision_error_reason}
        </p>
      ) : null}

      {pbVisionError ? (
        <p
          style={{
            margin: '8px 0 0',
            color: '#b00020',
            fontSize: '13px',
            lineHeight: 1.4,
          }}
          role="alert"
        >
          {pbVisionError}
        </p>
      ) : null}

      {proReviewError ? (
        <p
          style={{
            margin: '8px 0 0',
            color: '#b00020',
            fontSize: '13px',
            lineHeight: 1.4,
          }}
          role="alert"
        >
          {proReviewError}
        </p>
      ) : null}
    </div>
  );
}

type VideoSectionProps = {
  title: string;
  description: string;
  videos: Video[];
  showAdvancedActions: boolean;
  now: Date;
  downloadingAccessId: string | null;
  downloadErrors: Record<string, string>;
  onDownload: (accessId: string) => void;
  pbVisionLoadingAccessId: string | null;
  pbVisionErrors: Record<string, string>;
  onPbVision: (video: Video) => void;
  proReviewLoadingAccessId: string | null;
  proReviewErrors: Record<string, string>;
  onProReview: (video: Video) => void;
  purchaseLoadingKey: string | null;
  purchaseErrors: Record<string, string>;
  onPurchase: (accessId: string, products: string[]) => void;
};

function VideoSection({
  title,
  description,
  videos,
  showAdvancedActions,
  now,
  downloadingAccessId,
  downloadErrors,
  onDownload,
  pbVisionLoadingAccessId,
  pbVisionErrors,
  onPbVision,
  proReviewLoadingAccessId,
  proReviewErrors,
  onProReview,
  purchaseLoadingKey,
  purchaseErrors,
  onPurchase,
}: VideoSectionProps) {
  if (videos.length === 0) {
    return null;
  }

  return (
    <section style={{ marginBottom: '36px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '1.35rem' }}>{title}</h2>
        <p style={{ margin: 0, color: '#666', fontSize: '15px' }}>{description}</p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '18px',
        }}
      >
        {videos.map((video) => (
          <VideoCard
            key={video.access_id}
            video={video}
            now={now}
            showAdvancedActions={showAdvancedActions}
            downloadingAccessId={downloadingAccessId}
            downloadError={downloadErrors[video.access_id]}
            onDownload={onDownload}
            pbVisionLoadingAccessId={pbVisionLoadingAccessId}
            pbVisionError={pbVisionErrors[video.access_id]}
            onPbVision={onPbVision}
            proReviewLoadingAccessId={proReviewLoadingAccessId}
            proReviewError={proReviewErrors[video.access_id]}
            onProReview={onProReview}
            purchaseLoadingKey={purchaseLoadingKey}
            purchaseError={purchaseErrors[video.access_id]}
            onPurchase={onPurchase}
          />
        ))}
      </div>
    </section>
  );
}

export default function PlayerTroveContent({
  initialData = null,
  initialShowAccessRequest = false,
  initialError = null,
  queryToken = null,
  email = null,
  purchased = null,
  serverNow,
}: {
  initialData?: ApiResponse | null;
  initialShowAccessRequest?: boolean;
  initialError?: string | null;
  queryToken?: string | null;
  email?: string | null;
  purchased?: string | null;
  serverNow?: string;
}) {
  const [hashToken, setHashToken] = useState<string | null>(null);
  const serverLoadedRef = useRef(Boolean(initialData));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const hash = window.location.hash;
    if (hash.startsWith('#token=')) {
      setHashToken(decodeURIComponent(hash.slice('#token='.length)));
    }
  }, []);

  const token = queryToken || hashToken;

  const apiUrl = useMemo(() => {
    if (token) {
      return `/api/player-trove?token=${encodeURIComponent(token)}`;
    }
    if (email) {
      return `/api/player-trove?email=${encodeURIComponent(email)}`;
    }
    return '/api/player-trove';
  }, [token, email]);

  const hasUrlAuth = Boolean(token || email);

  const [data, setData] = useState<ApiResponse | null>(initialData);
  const [loading, setLoading] = useState(
    !initialData && !initialShowAccessRequest && !initialError
  );
  const [error, setError] = useState<string | null>(initialError);
  const [showAccessRequest, setShowAccessRequest] = useState(initialShowAccessRequest);
  const [viewerAuthenticated, setViewerAuthenticated] = useState(Boolean(initialData));
  const [downloadingAccessId, setDownloadingAccessId] = useState<string | null>(null);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [pbVisionLoadingAccessId, setPbVisionLoadingAccessId] = useState<string | null>(null);
  const [pbVisionErrors, setPbVisionErrors] = useState<Record<string, string>>({});
  const [proReviewLoadingAccessId, setProReviewLoadingAccessId] = useState<string | null>(null);
  const [proReviewErrors, setProReviewErrors] = useState<Record<string, string>>({});
  const [proReviewModalVideo, setProReviewModalVideo] = useState<Video | null>(null);
  const [purchaseLoadingKey, setPurchaseLoadingKey] = useState<string | null>(null);
  const [purchaseErrors, setPurchaseErrors] = useState<Record<string, string>>({});
  const [promoCode, setPromoCode] = useState('');

  useEffect(() => {
    if (serverLoadedRef.current && !purchased) {
      return;
    }

    setLoading(true);
    setError(null);
    setShowAccessRequest(false);

    fetch(apiUrl, { credentials: 'include' })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          if (!hasUrlAuth && res.status === 401) {
            setShowAccessRequest(true);
            return null;
          }

          const errorMsg = json?.error || `HTTP ${res.status}`;
          throw new Error(errorMsg);
        }
        return json;
      })
      .then((json) => {
        if (!json) {
          return;
        }

        setData(json);
        setViewerAuthenticated(true);
      })
      .catch((err) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        if (process.env.NODE_ENV === 'development') {
          console.error('[PlayerTroveContent] Failed to load videos', {
            error: errorMsg,
            timestamp: new Date().toISOString(),
          });
        }
      })
      .finally(() => setLoading(false));
  }, [apiUrl, hasUrlAuth, purchased]);

  function updateVideoPbVisionState(
    accessId: string,
    patch: Partial<
      Pick<
        Video,
        | 'pb_vision_request_id'
        | 'pb_vision_status'
        | 'pb_vision_webpage_url'
        | 'pb_vision_error_reason'
      >
    >
  ) {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        videos: current.videos.map((video) =>
          video.access_id === accessId ? { ...video, ...patch } : video
        ),
      };
    });
  }

  function updateVideoProReviewState(
    accessId: string,
    patch: Partial<
      Pick<
        Video,
        | 'pro_review_request_id'
        | 'pro_review_status'
        | 'pro_review_reviewer_link'
        | 'pro_review_buyer_position'
        | 'pro_review_identification_frame_s3_key'
        | 'pro_review_identification_frame_url'
      >
    >
  ) {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        videos: current.videos.map((video) =>
          video.access_id === accessId ? { ...video, ...patch } : video
        ),
      };
    });
  }

  function handleProReviewClick(video: Video) {
    if (!viewerAuthenticated && !token) {
      setProReviewErrors((prev) => ({
        ...prev,
        [video.access_id]: 'A secure access link is required to request Pro Review',
      }));
      return;
    }

    setProReviewErrors((prev) => {
      const next = { ...prev };
      delete next[video.access_id];
      return next;
    });
    setProReviewModalVideo(video);
  }

  async function handlePbVisionClick(video: Video) {
    if (!viewerAuthenticated && !token) {
      setPbVisionErrors((prev) => ({
        ...prev,
        [video.access_id]: 'A secure access link is required to use PB Vision',
      }));
      return;
    }

    setPbVisionLoadingAccessId(video.access_id);
    setPbVisionErrors((prev) => {
      const next = { ...prev };
      delete next[video.access_id];
      return next;
    });

    try {
      const response = await fetch('/api/player-trove/pb-vision/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          access_id: video.access_id,
          token: token ?? undefined,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result?.error || `HTTP ${response.status}`;
        setPbVisionErrors((prev) => ({ ...prev, [video.access_id]: errorMsg }));
        return;
      }

      updateVideoPbVisionState(video.access_id, {
        pb_vision_request_id: result.request_id ?? video.pb_vision_request_id,
        pb_vision_status: result.status ?? 'submitted',
        pb_vision_webpage_url: result.pbv_webpage_url ?? null,
        pb_vision_error_reason: null,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setPbVisionErrors((prev) => ({ ...prev, [video.access_id]: errorMsg }));
    } finally {
      setPbVisionLoadingAccessId((current) =>
        current === video.access_id ? null : current
      );
    }
  }

  async function handlePurchaseClick(accessId: string, products: string[]) {
    const loadingKey = `${accessId}:${products.join(',')}`;
    setPurchaseLoadingKey(loadingKey);
    setPurchaseErrors((prev) => {
      const next = { ...prev };
      delete next[accessId];
      return next;
    });

    try {
      const response = await fetch('/api/player-trove/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          access_id: accessId,
          products,
          token: token ?? undefined,
          email: email ?? undefined,
          promoCode: promoCode.trim() || undefined,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        setPurchaseErrors((prev) => ({
          ...prev,
          [accessId]: result?.error || 'Checkout failed',
        }));
        return;
      }

      if (result.url) {
        window.location.href = result.url;
      } else {
        setPurchaseErrors((prev) => ({
          ...prev,
          [accessId]: 'Checkout URL not returned',
        }));
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setPurchaseErrors((prev) => ({ ...prev, [accessId]: errorMsg }));
    } finally {
      setPurchaseLoadingKey((current) => (current === loadingKey ? null : current));
    }
  }

  async function handleDownloadClick(accessId: string) {
    setDownloadingAccessId(accessId);
    setDownloadErrors((prev) => {
      const next = { ...prev };
      delete next[accessId];
      return next;
    });

    try {
      const downloadParams = new URLSearchParams({ access_id: accessId });

      if (token) {
        downloadParams.set('token', token);
      } else if (email) {
        downloadParams.set('email', email);
      }

      const response = await fetch(
        `/api/player-trove/download?${downloadParams.toString()}`,
        { credentials: 'include' }
      );
      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result?.error || `HTTP ${response.status}`;
        setDownloadErrors((prev) => ({ ...prev, [accessId]: errorMsg }));
        return;
      }

      if (!result?.url) {
        setDownloadErrors((prev) => ({
          ...prev,
          [accessId]: 'Download URL not returned',
        }));
        return;
      }

      setDownloadErrors((prev) => {
        const next = { ...prev };
        delete next[accessId];
        return next;
      });

      window.location.href = result.url;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setDownloadErrors((prev) => ({ ...prev, [accessId]: errorMsg }));
    } finally {
      setDownloadingAccessId((current) => (current === accessId ? null : current));
    }
  }

  if (showAccessRequest && !data) {
    return (
      <ReplayTrovePageShell
        title="PlayerTrove"
        subtitle="Secure access to your purchased and claimed videos"
      >
        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '32px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 16px', color: '#444', lineHeight: 1.6 }}>
            To view your videos, request a secure access link by email.
          </p>
          <Link
            href="/player-trove/request"
            style={{
              display: 'inline-block',
              padding: '12px 20px',
              borderRadius: '10px',
              background: '#111111',
              color: '#ffffff',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Get My PlayerTrove Link
          </Link>
        </div>
      </ReplayTrovePageShell>
    );
  }

  if (loading) {
    return (
      <ReplayTrovePageShell title="PlayerTrove" subtitle="Loading your purchased videos...">
        <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
      </ReplayTrovePageShell>
    );
  }

  if (error && !data) {
    return (
      <ReplayTrovePageShell title="PlayerTrove" subtitle="Access your purchased videos">
        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '32px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: '0 0 16px', color: '#b00020' }}>{error}</p>
          <Link
            href="/player-trove/request"
            style={{
              display: 'inline-block',
              padding: '10px 18px',
              borderRadius: '10px',
              background: '#111111',
              color: '#ffffff',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Request a New Link
          </Link>
        </div>
      </ReplayTrovePageShell>
    );
  }

  if (!data) {
    return (
      <ReplayTrovePageShell title="PlayerTrove" subtitle="Access your purchased videos">
        <div style={{ textAlign: 'center', padding: '40px', color: '#b00020' }}>
          Failed to load videos
        </div>
      </ReplayTrovePageShell>
    );
  }

  const now = serverNow ? new Date(serverNow) : new Date();
  const shortClips = data.videos.filter(isShortClip);
  const fullGameClips = data.videos.filter(isFullGameClip);
  const purchaseComplete = purchased === '1';

  return (
    <ReplayTrovePageShell title="PlayerTrove" subtitle={`Your videos for ${data.email}`}>
      {purchaseComplete ? (
        <div
          style={{
            marginBottom: '20px',
            padding: '14px 16px',
            borderRadius: '12px',
            background: '#e8f5e9',
            color: '#1b5e20',
            fontWeight: 600,
          }}
        >
          Purchase complete. Your entitlements have been updated.
        </div>
      ) : null}

      <div
        style={{
          marginBottom: '20px',
          padding: '14px 16px',
          borderRadius: '12px',
          background: '#f8f9fa',
          border: '1px solid #e9ecef',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <label htmlFor="player-trove-promo" style={{ fontWeight: 600, fontSize: '14px' }}>
          Promo code
        </label>
        <input
          id="player-trove-promo"
          type="text"
          value={promoCode}
          onChange={(event) => setPromoCode(event.target.value)}
          placeholder="Optional discount code"
          style={{
            minWidth: '220px',
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid #ddd',
          }}
        />
        <span style={{ fontSize: '13px', color: '#666' }}>
          Applied at checkout for PlayerTrove purchases.
        </span>
      </div>
      {data.videos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          No videos found for this email.
        </div>
      ) : (
        <>
          <VideoSection
            title={`Short Clips (${shortClips.length})`}
            description="Instant replays and highlights under 5 minutes."
            videos={shortClips}
            showAdvancedActions={false}
            now={now}
            downloadingAccessId={downloadingAccessId}
            downloadErrors={downloadErrors}
            onDownload={handleDownloadClick}
            pbVisionLoadingAccessId={pbVisionLoadingAccessId}
            pbVisionErrors={pbVisionErrors}
            onPbVision={handlePbVisionClick}
            proReviewLoadingAccessId={proReviewLoadingAccessId}
            proReviewErrors={proReviewErrors}
            onProReview={handleProReviewClick}
            purchaseLoadingKey={purchaseLoadingKey}
            purchaseErrors={purchaseErrors}
            onPurchase={handlePurchaseClick}
          />

          <VideoSection
            title={`Full Game Recordings (${fullGameClips.length})`}
            description="Complete game footage with coaching and analysis options."
            videos={fullGameClips}
            showAdvancedActions={true}
            now={now}
            downloadingAccessId={downloadingAccessId}
            downloadErrors={downloadErrors}
            onDownload={handleDownloadClick}
            pbVisionLoadingAccessId={pbVisionLoadingAccessId}
            pbVisionErrors={pbVisionErrors}
            onPbVision={handlePbVisionClick}
            proReviewLoadingAccessId={proReviewLoadingAccessId}
            proReviewErrors={proReviewErrors}
            onProReview={handleProReviewClick}
            purchaseLoadingKey={purchaseLoadingKey}
            purchaseErrors={purchaseErrors}
            onPurchase={handlePurchaseClick}
          />
        </>
      )}

      {proReviewModalVideo && (viewerAuthenticated || token) ? (
        <ProReviewRequestModal
          video={{
            access_id: proReviewModalVideo.access_id,
            clip_title: proReviewModalVideo.clip_title,
          }}
          token={token ?? ''}
          useCookieAuth={viewerAuthenticated && !token}
          initialRequestId={proReviewModalVideo.pro_review_request_id}
          onClose={() => setProReviewModalVideo(null)}
          onSubmitted={(patch) => {
            updateVideoProReviewState(proReviewModalVideo.access_id, patch);
            setProReviewModalVideo(null);
          }}
        />
      ) : null}
    </ReplayTrovePageShell>
  );
}
