'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';

type Video = {
  access_id: string;
  clip_id: string;
  clip_slug: string;
  recorded_at: string | null;
  booking_id: string | null;
  thumbnail_url: string | null;
  youtube_url: string | null;
  youtube_status: string;
  download_expires_at: string | null;
  pb_vision_expires_at: string | null;
  coach_review_expires_at: string | null;
  purchased_at: string;
};

type ApiResponse = {
  email: string;
  videos: Video[];
};

export default function PlayerTroveContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingClip, setDownloadingClip] = useState<string | null>(null);

  useEffect(() => {
    if (!email) {
      setError('Email parameter required');
      setLoading(false);
      return;
    }

    fetch(`/api/player-trove?email=${encodeURIComponent(email)}`)
      .then(async res => {
        const json = await res.json();
        if (!res.ok) {
          const errorMsg = json?.error || `HTTP ${res.status}`;
          throw new Error(errorMsg);
        }
        return json;
      })
      .then(setData)
      .catch(err => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        // Log error in development for debugging
        if (process.env.NODE_ENV === 'development') {
          console.error('[PlayerTroveContent] Failed to load videos', {
            email,
            error: errorMsg,
            timestamp: new Date().toISOString(),
          });
        }
      })
      .finally(() => setLoading(false));
  }, [email]);

  async function handleDownloadClick(accessId: string) {
    setDownloadingClip(accessId);

    console.log('[PlayerTrove] Download started', {
      access_id: accessId,
      timestamp: new Date().toISOString(),
    });

    try {
      const response = await fetch(`/api/player-trove/download?access_id=${encodeURIComponent(accessId)}`);
      const result = await response.json();

      if (!response.ok) {
        const errorMsg = result?.error || `HTTP ${response.status}`;
        console.error('[PlayerTrove] Failed to fetch download URL', {
          access_id: accessId,
          error: errorMsg,
          status: response.status,
        });
        setError(errorMsg);
        return;
      }

      if (!result?.url) {
        console.error('[PlayerTrove] Download URL missing in response', {
          access_id: accessId,
          result,
        });
        setError('Download URL not returned');
        return;
      }

      console.log('[PlayerTrove] Download URL obtained', {
        access_id: accessId,
        url: result.url,
      });

      window.location.href = result.url;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[PlayerTrove] Download request failed', {
        access_id: accessId,
        error: errorMsg,
      });
      setError(errorMsg);
    } finally {
      setTimeout(() => {
        setDownloadingClip(null);
      }, 4000);
    }
  }

  if (loading) {
    return (
      <ReplayTrovePageShell title="PlayerTrove" subtitle="Loading your purchased videos...">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          Loading...
        </div>
      </ReplayTrovePageShell>
    );
  }

  if (error || !data) {
    return (
      <ReplayTrovePageShell title="PlayerTrove" subtitle="Access your purchased videos">
        <div style={{ textAlign: 'center', padding: '40px', color: '#b00020' }}>
          {error || 'Failed to load videos'}
        </div>
      </ReplayTrovePageShell>
    );
  }

  const now = new Date();

  return (
    <ReplayTrovePageShell title="PlayerTrove" subtitle={`Purchased videos for ${data.email}`}>
      <div style={{ marginBottom: '20px' }}>
        <h2>Purchased Videos ({data.videos.length})</h2>
      </div>

      {data.videos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          No purchased videos found for this email.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          {data.videos.map((video) => {
            const downloadExpired = !video.download_expires_at || new Date(video.download_expires_at) < now;
            const pbVisionExpired = !video.pb_vision_expires_at || new Date(video.pb_vision_expires_at) < now;
            const coachReviewExpired = !video.coach_review_expires_at || new Date(video.coach_review_expires_at) < now;
            const youtubeReady = video.youtube_url && video.youtube_status === 'ready';

            return (
              <div
                key={video.access_id}
                style={{
                  border: '1px solid #dedede',
                  borderRadius: '16px',
                  padding: '24px',
                  background: '#ffffff',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
                }}
              >
                <div style={{ display: 'flex', gap: '20px', alignItems: 'start' }}>
                  {/* Thumbnail placeholder */}
                  <div
                    style={{
                      width: '120px',
                      height: '80px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: '#f0f0f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#666',
                      fontSize: '12px',
                    }}
                  >
                    {video.thumbnail_url ? (
                      <img
                        src={video.thumbnail_url}
                        alt={`Thumbnail for ${video.clip_slug}`}
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

                  <div style={{ flex: 1 }}>
                    <h3 style={{ marginTop: 0, marginBottom: '8px' }}>
                      Clip {video.clip_slug}
                    </h3>
                    <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
                      Recorded: {video.recorded_at ? new Date(video.recorded_at).toLocaleDateString() : 'Unknown'}
                    </p>
                    <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
                      Booking ID: {video.booking_id || 'N/A'}
                    </p>
                    <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
                      Purchased: {new Date(video.purchased_at).toLocaleDateString()}
                    </p>

                    <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                      {/* Watch on YouTube */}
                      <button
                        disabled={!youtubeReady}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          border: 'none',
                          background: youtubeReady ? '#ff0000' : '#ccc',
                          color: 'white',
                          cursor: youtubeReady ? 'pointer' : 'not-allowed',
                        }}
                        onClick={() => youtubeReady && window.open(video.youtube_url!, '_blank')}
                      >
                        {youtubeReady ? 'Watch on YouTube' : 'YouTube Not Ready'}
                      </button>

                      {/* Download HD File */}
                      <button
                        disabled={downloadExpired || downloadingClip === video.access_id}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          border: 'none',
                          background: downloadExpired ? '#ccc' : '#007bff',
                          color: 'white',
                          cursor: downloadExpired || downloadingClip === video.access_id ? 'not-allowed' : 'pointer',
                          opacity: downloadingClip === video.access_id ? 0.6 : 1,
                        }}
                        onClick={() => !downloadExpired && handleDownloadClick(video.access_id)}
                      >
                        {downloadExpired ? 'Download Expired' : downloadingClip === video.access_id ? 'Preparing...' : 'Download HD File'}
                      </button>

                      {/* Send to PB.Vision */}
                      <button
                        disabled={pbVisionExpired}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          border: 'none',
                          background: pbVisionExpired ? '#ccc' : '#28a745',
                          color: 'white',
                          cursor: pbVisionExpired ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {pbVisionExpired ? 'PB.Vision Expired' : 'Send to PB.Vision'}
                      </button>

                      {/* Request Pro Review */}
                      <button
                        disabled={coachReviewExpired}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          border: 'none',
                          background: coachReviewExpired ? '#ccc' : '#ffc107',
                          color: 'black',
                          cursor: coachReviewExpired ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {coachReviewExpired ? 'Pro Review Expired' : 'Request Pro Review'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ReplayTrovePageShell>
  );
}