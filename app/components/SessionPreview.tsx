'use client';

import { useEffect, useRef, useState } from 'react';

type SessionPreviewProps = {
  slug: string;
};

export default function SessionPreview({ slug }: SessionPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasSeekedRef = useRef(false);

  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadPreview() {
      try {
        setLoading(true);
        setError('');
        setPreviewUrl('');
        setFrameReady(false);
        hasSeekedRef.current = false;

        const response = await fetch(
          `/api/preview?slug=${encodeURIComponent(slug)}`,
          { cache: 'no-store' }
        );

        const data = await response.json();

        if (!isActive) {
          return;
        }

        if (!response.ok || !data.previewUrl) {
          setError(data.error || 'Could not load preview');
          setLoading(false);
          return;
        }

        setPreviewUrl(data.previewUrl);
        setLoading(false);
      } catch (err) {
        console.error(err);

        if (!isActive) {
          return;
        }

        setError('Preview failed to load');
        setLoading(false);
      }
    }

    loadPreview();

    return () => {
      isActive = false;
    };
  }, [slug]);

  function handleLoadedData() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (hasSeekedRef.current) {
      setFrameReady(true);
      return;
    }

    hasSeekedRef.current = true;

    const safeSeekTime =
      Number.isFinite(video.duration) && video.duration > 0.05 ? 0.05 : 0;

    if (safeSeekTime === 0) {
      setFrameReady(true);
      return;
    }

    try {
      video.currentTime = safeSeekTime;
    } catch (err) {
      console.error('Could not seek preview video:', err);
      setFrameReady(true);
    }
  }

  function handleSeeked() {
    setFrameReady(true);
  }

  if (loading) {
    return (
      <div
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          background: '#eee',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1rem',
          color: '#555',
          fontSize: '0.92rem',
          fontWeight: 500,
        }}
      >
        Loading preview...
      </div>
    );
  }

  if (error || !previewUrl) {
    return (
      <div
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          background: '#eee',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1rem',
          textAlign: 'center',
          padding: '1rem',
          boxSizing: 'border-box',
          color: '#555',
          fontSize: '0.92rem',
          fontWeight: 500,
        }}
      >
        Preview unavailable
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '16 / 9',
        background: '#000',
        borderRadius: '6px',
        marginBottom: '1rem',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {!frameReady && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: '#111',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#bbb',
            fontSize: '0.9rem',
            fontWeight: 500,
            zIndex: 1,
          }}
        >
          Loading preview...
        </div>
      )}

      <video
        ref={videoRef}
        controls
        preload="auto"
        playsInline
        muted
        onLoadedData={handleLoadedData}
        onSeeked={handleSeeked}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          background: '#000',
          visibility: frameReady ? 'visible' : 'hidden',
        }}
      >
        <source src={previewUrl} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
}