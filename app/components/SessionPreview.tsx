'use client';

import { useEffect, useRef, useState } from 'react';

type SessionPreviewProps = {
  slug: string;
};

export default function SessionPreview({ slug }: SessionPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasAttemptedSeekRef = useRef(false);
  const readyFallbackTimeoutRef = useRef<number | null>(null);

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
        hasAttemptedSeekRef.current = false;

        if (readyFallbackTimeoutRef.current) {
          window.clearTimeout(readyFallbackTimeoutRef.current);
          readyFallbackTimeoutRef.current = null;
        }

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

      if (readyFallbackTimeoutRef.current) {
        window.clearTimeout(readyFallbackTimeoutRef.current);
      }
    };
  }, [slug]);

  function markReady() {
    setFrameReady(true);

    if (readyFallbackTimeoutRef.current) {
      window.clearTimeout(readyFallbackTimeoutRef.current);
      readyFallbackTimeoutRef.current = null;
    }
  }

  function attemptSeekPreviewFrame() {
    const video = videoRef.current;

    if (!video || hasAttemptedSeekRef.current) {
      return;
    }

    hasAttemptedSeekRef.current = true;

    if (readyFallbackTimeoutRef.current) {
      window.clearTimeout(readyFallbackTimeoutRef.current);
    }

    readyFallbackTimeoutRef.current = window.setTimeout(() => {
      setFrameReady(true);
    }, 1200);

    try {
      const duration = video.duration;
      const safeSeekTime =
        Number.isFinite(duration) && duration > 0.05 ? 0.05 : 0;

      if (safeSeekTime > 0) {
        video.currentTime = safeSeekTime;
      } else {
        markReady();
      }
    } catch (err) {
      console.error('Could not seek preview video:', err);
      markReady();
    }
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
            pointerEvents: 'none',
          }}
        >
          Loading preview...
        </div>
      )}

      <video
        ref={videoRef}
        controls
        preload="metadata"
        playsInline
        muted
        onLoadedMetadata={attemptSeekPreviewFrame}
        onLoadedData={markReady}
        onCanPlay={markReady}
        onSeeked={markReady}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          background: '#000',
        }}
      >
        <source src={previewUrl} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
}