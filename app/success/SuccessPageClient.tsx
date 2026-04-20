'use client';

import { useEffect, useMemo, useState } from 'react';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import SessionPreview from '@/app/components/SessionPreview';
import DownloadAllButton from '@/app/components/DownloadAllButton';
import { formatDuration } from '@/lib/format';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [bookingId, setBookingId] = useState<string | null>(null);
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

  const totalPaid = useMemo(() => {
    return orders.reduce((sum, order) => sum + (order.amount_total ?? 0), 0);
  }, [orders]);

  const isFreeOrder = orders.length > 0 && totalPaid === 0;

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
                  {!isFreeOrder && totalPaid > 0
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
                      downloadingClip === order.clip_id ? 'not-allowed' : 'pointer',
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
    </ReplayTrovePageShell>
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