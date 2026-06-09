'use client';

import { useEffect, useMemo, useState } from 'react';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import SessionPreview from '@/app/components/SessionPreview';
import DownloadAllButton from '@/app/components/DownloadAllButton';
import { formatDuration } from '@/lib/format';
import {
  canDownloadHd,
  formatClaimedDate,
  formatDownloadExpiry,
  getClipDateLine,
  getClipHeading,
  getClipLocationLine,
  isFullGameClip,
  isShortClip,
  type PlayerTroveApiResponse,
  type PlayerTroveVideo,
} from '@/lib/player-trove-display';

type Clip = {
  id: string;
  title: string;
  slug: string;
  recorded_at?: string | null;
  duration_seconds?: number | null;
};

type Order = {
  clip_id: string;
  clip: Clip | null;
  amount_total?: number | null;
};

type PlayerTrovePayload = PlayerTroveApiResponse & {
  token: string;
};

const CLUB_TIME_ZONE = 'America/Chicago';

function formatClipTime(recordedAt: string, timeZone = CLUB_TIME_ZONE) {
  const date = new Date(recordedAt);

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  });
}

export default function SuccessPageClient() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [email, setEmail] = useState<string | null>(null);
  const [playerTrove, setPlayerTrove] = useState<PlayerTrovePayload | null>(null);
  const [purchasedClipIds, setPurchasedClipIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [totalAmountCents, setTotalAmountCents] = useState<number | null>(null);
  const [amountKnown, setAmountKnown] = useState(false);
  const [isPaid, setIsPaid] = useState(true);
  const [downloadingClip, setDownloadingClip] = useState<string | null>(null);

  useEffect(() => {
    async function loadSessionWithRetry() {
      const params = new URLSearchParams(window.location.search);
      const currentSessionId = params.get('session_id');

      if (!currentSessionId) {
        setError('Missing session ID');
        setLoading(false);
        return;
      }

      setSessionId(currentSessionId);

      const maxAttempts = 8;
      const delayMs = 1000;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const response = await fetch(
            `/api/checkout-session?session_id=${encodeURIComponent(currentSessionId)}`,
            { cache: 'no-store' }
          );

          const data = await response.json();

          if (response.ok && data.orders && data.orders.length > 0) {
            setOrders(data.orders);
            setEmail(data.email || null);
            setBookingId(data.bookingId || null);
            setPurchasedClipIds(
              Array.isArray(data.purchased_clip_ids) ? data.purchased_clip_ids : []
            );
            setPlayerTrove(data.player_trove || null);

            // Session total from API (do not sum order rows — each holds the full Stripe total).
            const centsFromApi =
              typeof data.total_amount_cents === 'number'
                ? data.total_amount_cents
                : typeof data.orders[0]?.amount_total === 'number'
                  ? data.orders[0].amount_total
                  : null;

            const known =
              typeof data.amount_known === 'boolean'
                ? data.amount_known
                : centsFromApi != null;

            // Stripe success sessions are paid unless amount_total is explicitly 0.
            const paid =
              typeof data.is_paid === 'boolean'
                ? data.is_paid
                : known
                  ? (centsFromApi ?? 0) > 0
                  : true;

            if (!known) {
              console.warn(
                '[SuccessPage] amount_total unavailable; treating Stripe success session as paid'
              );
            }

            setTotalAmountCents(centsFromApi);
            setAmountKnown(known);
            setIsPaid(paid);

            if (data.bookingId) {
              localStorage.removeItem(`replaytrove-cart-${data.bookingId}`);
              localStorage.removeItem(`rallyvision-cart-${data.bookingId}`);
            }

            setLoading(false);
            return;
          }

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          } else {
            setError(
              data.error || 'Your clips are still processing. Please refresh in a moment.'
            );
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error(err);

          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          } else {
            setError('Something went wrong loading your clips.');
            setLoading(false);
            return;
          }
        }
      }
    }

    loadSessionWithRetry();
  }, []);

  // Free only when we know the Stripe session total was exactly $0.00.
  // Missing amount on a paid-order success session defaults to paid display.
  const isFreeOrder = amountKnown && isPaid === false;
  const totalPaid = totalAmountCents ?? 0;

  const purchasedClipIdSet = useMemo(
    () => new Set(purchasedClipIds),
    [purchasedClipIds]
  );

  const libraryVideos = useMemo(() => {
    if (!playerTrove?.videos?.length) {
      return [];
    }

    return playerTrove.videos.filter(
      (video) => !purchasedClipIdSet.has(video.clip_id)
    );
  }, [playerTrove, purchasedClipIdSet]);

  const shortLibraryClips = useMemo(
    () => libraryVideos.filter(isShortClip),
    [libraryVideos]
  );

  const fullGameLibraryClips = useMemo(
    () => libraryVideos.filter(isFullGameClip),
    [libraryVideos]
  );

  const playerTroveHref = playerTrove?.token
    ? `/player-trove?token=${encodeURIComponent(playerTrove.token)}`
    : '/player-trove';

  const pageTitle = isFreeOrder ? 'Clips Ready' : 'Payment Successful';
  const pageSubtitle = isFreeOrder
    ? 'No purchase was required. Your clips are ready to download.'
    : 'Your clips are ready to download.';

  function handleClipDownload(clipId: string) {
    setDownloadingClip(clipId);

    window.location.href = `/api/download?clip_id=${encodeURIComponent(
      clipId
    )}&session_id=${encodeURIComponent(sessionId)}`;

    setTimeout(() => {
      setDownloadingClip((current) => (current === clipId ? null : current));
    }, 4000);
  }

  return (
    <ReplayTrovePageShell
      title={pageTitle}
      subtitle={pageSubtitle}
      maxWidth="1200px"
    >
      {loading ? (
        <div style={cardStyle}>
          <p style={{ margin: 0, color: '#444', fontWeight: 500 }}>
            Finalizing your clips...
          </p>
          <p style={{ marginTop: '8px', fontSize: '0.9rem', color: '#777' }}>
            This usually takes just a few seconds.
          </p>
        </div>
      ) : error ? (
        <div style={cardStyle}>
          <p style={{ margin: 0, color: '#444' }}>{error}</p>

          <button
            onClick={() => window.location.reload()}
            style={secondaryButton}
          >
            Try Again
          </button>
        </div>
      ) : (
        <>
          <div style={cardStyle}>
            <div style={summaryTopRow}>
              <div style={summaryTextBlock}>
                {email && (
                  <p style={{ margin: 0, color: '#17191c' }}>
                    <strong>{isFreeOrder ? 'Unlocked for:' : 'Purchased by:'}</strong>{' '}
                    {email}
                  </p>
                )}

                <p
                  style={{
                    marginTop: email ? '8px' : 0,
                    marginBottom: 0,
                    color: '#555',
                    fontSize: '0.95rem',
                  }}
                >
                  {orders.length} clip{orders.length !== 1 ? 's' : ''} ready for
                  download
                  {!isFreeOrder && amountKnown && totalPaid > 0
                    ? ` • Total paid: $${(totalPaid / 100).toFixed(2)}`
                    : ''}
                </p>
              </div>

              <div style={buttonStackStyle}>
                <DownloadAllButton sessionId={sessionId} />

                {bookingId && (
                  <button
                    onClick={() => {
                      window.location.href = `/session/${bookingId}`;
                    }}
                    style={secondaryButton}
                  >
                    Back to Session
                  </button>
                )}
              </div>
            </div>
          </div>

          {orders.length > 0 && (
            <>
              <h2 style={sectionHeadingStyle}>Just Purchased</h2>
              <div style={gridStyle}>
                {orders.map((order) => (
                  <div key={order.clip_id} style={clipCardStyle}>
                    {order.clip?.slug ? (
                      <SessionPreview slug={order.clip.slug} />
                    ) : (
                      <div style={previewFallbackStyle}>Preview unavailable</div>
                    )}

                    <h3 style={titleStyle}>
                      {order.clip?.recorded_at
                        ? formatClipTime(order.clip.recorded_at)
                        : order.clip?.title || 'Clip'}
                      {order.clip?.duration_seconds
                        ? ` | ${formatDuration(order.clip.duration_seconds)}`
                        : ''}
                    </h3>

                    <button
                      disabled={downloadingClip === order.clip_id}
                      onClick={() => handleClipDownload(order.clip_id)}
                      style={{
                        ...downloadButton,
                        opacity: downloadingClip === order.clip_id ? 0.6 : 1,
                        cursor:
                          downloadingClip === order.clip_id
                            ? 'not-allowed'
                            : 'pointer',
                      }}
                    >
                      {downloadingClip === order.clip_id
                        ? 'Preparing...'
                        : 'Download Clip'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {libraryVideos.length > 0 && (
            <div style={libraryIntroStyle}>
              <h2 style={{ ...sectionHeadingStyle, marginBottom: '8px' }}>
                Your PlayerTrove
              </h2>
              <p style={{ margin: 0, color: '#555', fontSize: '0.95rem' }}>
                {libraryVideos.length} earlier clip
                {libraryVideos.length !== 1 ? 's' : ''} from your library
              </p>
              <a href={playerTroveHref} style={playerTroveLinkStyle}>
                Open full PlayerTrove
              </a>
            </div>
          )}

          {shortLibraryClips.length > 0 && (
            <>
              <h3 style={subsectionHeadingStyle}>
                Short Clips ({shortLibraryClips.length})
              </h3>
              <div style={gridStyle}>
                {shortLibraryClips.map((video) => (
                  <LibraryVideoCard
                    key={video.access_id}
                    video={video}
                    token={playerTrove?.token}
                  />
                ))}
              </div>
            </>
          )}

          {fullGameLibraryClips.length > 0 && (
            <>
              <h3 style={subsectionHeadingStyle}>
                Full Game Recordings ({fullGameLibraryClips.length})
              </h3>
              <div style={gridStyle}>
                {fullGameLibraryClips.map((video) => (
                  <LibraryVideoCard
                    key={video.access_id}
                    video={video}
                    token={playerTrove?.token}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </ReplayTrovePageShell>
  );
}

function LibraryVideoCard({
  video,
  token,
}: {
  video: PlayerTroveVideo;
  token?: string;
}) {
  const now = new Date();
  const heading = getClipHeading(video);
  const locationLine = getClipLocationLine(video);
  const dateLine = getClipDateLine(video);
  const claimedDate = formatClaimedDate(video.purchased_at);
  const downloadExpiry = formatDownloadExpiry(video.download_expires_at);
  const downloadAllowed = canDownloadHd(video, now);
  const downloadParams = new URLSearchParams({
    access_id: video.access_id,
    redirect: '1',
  });

  if (token) {
    downloadParams.set('token', token);
  }

  const downloadHref = `/api/player-trove/download?${downloadParams.toString()}`;

  return (
    <div style={clipCardStyle}>
      {video.thumbnail_url ? (
        <img
          src={video.thumbnail_url}
          alt={heading}
          style={thumbnailStyle}
        />
      ) : video.clip_slug ? (
        <SessionPreview slug={video.clip_slug} />
      ) : (
        <div style={previewFallbackStyle}>Preview unavailable</div>
      )}

      <h3 style={titleStyle}>{heading}</h3>

      {locationLine && <p style={metaLineStyle}>{locationLine}</p>}
      {dateLine && <p style={metaLineStyle}>{dateLine}</p>}
      {claimedDate && (
        <p style={metaLineStyle}>Claimed {claimedDate}</p>
      )}
      {downloadExpiry && (
        <p style={metaLineStyle}>Download available until {downloadExpiry}</p>
      )}

      {downloadAllowed ? (
        <a href={downloadHref} style={downloadLinkStyle}>
          Download HD
        </a>
      ) : (
        <p style={{ margin: 0, color: '#777', fontSize: '0.9rem' }}>
          Download unavailable
        </p>
      )}
    </div>
  );
}

/* ================== STYLES ================== */

const cardStyle = {
  border: '1px solid #dedede',
  borderRadius: '16px',
  padding: '22px 24px',
  background: '#ffffff',
  boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
  marginBottom: '24px',
};

const summaryTopRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '18px',
  flexWrap: 'wrap' as const,
};

const summaryTextBlock = {
  minWidth: 0,
  flex: '1 1 320px',
};

const clipCardStyle = {
  border: '1px solid #dedede',
  borderRadius: '16px',
  padding: '20px',
  background: '#ffffff',
  boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
};

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '18px',
  marginBottom: '28px',
};

const sectionHeadingStyle = {
  margin: '0 0 16px',
  fontSize: '1.35rem',
  color: '#17191c',
};

const subsectionHeadingStyle = {
  margin: '8px 0 16px',
  fontSize: '1.1rem',
  color: '#333',
};

const libraryIntroStyle = {
  marginTop: '8px',
  marginBottom: '24px',
  paddingTop: '8px',
  borderTop: '1px solid #ececec',
};

const playerTroveLinkStyle = {
  display: 'inline-block',
  marginTop: '12px',
  color: '#111',
  fontWeight: 600,
  fontSize: '0.95rem',
};

const metaLineStyle = {
  margin: '0 0 6px',
  color: '#555',
  fontSize: '0.9rem',
};

const thumbnailStyle = {
  width: '100%',
  aspectRatio: '16 / 9',
  objectFit: 'cover' as const,
  borderRadius: '6px',
  marginBottom: '1rem',
  background: '#eee',
};

const downloadLinkStyle = {
  display: 'block',
  width: '100%',
  padding: '0.85rem',
  background: 'linear-gradient(135deg, #111315 0%, #25282d 100%)',
  color: '#ffffff',
  border: 'none',
  borderRadius: '10px',
  fontWeight: 700,
  fontSize: '0.96rem',
  textAlign: 'center' as const,
  textDecoration: 'none',
  boxSizing: 'border-box' as const,
};

const titleStyle = {
  marginTop: 0,
  marginBottom: '14px',
  fontSize: '1.1rem',
  color: '#17191c',
};

const previewFallbackStyle = {
  width: '100%',
  aspectRatio: '16 / 9',
  background: '#eee',
  borderRadius: '6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '1rem',
  textAlign: 'center' as const,
  padding: '1rem',
  boxSizing: 'border-box' as const,
  color: '#555',
};

const buttonStackStyle = {
  display: 'grid',
  gap: '12px',
  width: 'fit-content',
};

const secondaryButton = {
  padding: '0.7rem 1rem',
  background: '#f1f1f1',
  color: '#333',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.9rem',
};

const downloadButton = {
  width: '100%',
  padding: '0.85rem',
  background: 'linear-gradient(135deg, #111315 0%, #25282d 100%)',
  color: '#ffffff',
  border: 'none',
  borderRadius: '10px',
  fontWeight: 700,
  fontSize: '0.96rem',
};