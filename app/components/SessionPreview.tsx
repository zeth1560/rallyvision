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
  const [overlayIndex, setOverlayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

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

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    const overlayMessages = [
      'ReplayTrove Preview',
      'HD Version Available After Purchase',
    ];

    const interval = window.setInterval(() => {
      setOverlayIndex((current) => (current + 1) % overlayMessages.length);
    }, 4000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => {
      setCurrentTime(video.currentTime);
      setDuration(video.duration);
    };

    const updateDuration = () => {
      setDuration(video.duration);
    };

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('durationchange', updateDuration);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('durationchange', updateDuration);
    };
  }, []);

  useEffect(() => {
    setOverlayIndex(0);
    setIsPlaying(false);
  }, [slug]);

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
    <>
      <style>{`
        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
        }

        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        input[type="range"]::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #fff;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        input[type="range"]::-webkit-slider-runnable-track {
          background: transparent;
          height: 4px;
        }

        input[type="range"]::-moz-range-track {
          background: transparent;
          height: 4px;
        }
      `}</style>
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
        preload="metadata"
        playsInline
        muted
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
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

      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
          padding: '20px 12px 12px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 2,
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            if (videoRef.current) {
              if (videoRef.current.paused) {
                videoRef.current.play();
              } else {
                videoRef.current.pause();
              }
            }
          }}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: '6px 10px',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 'bold',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.3)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.2)';
          }}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <input
          type="range"
          min="0"
          max="100"
          value={duration ? (currentTime / duration) * 100 : 0}
          onChange={(e) => {
            if (videoRef.current) {
              videoRef.current.currentTime = (parseFloat(e.target.value) / 100) * duration;
            }
          }}
          style={{
            flex: 1,
            height: '4px',
            cursor: 'pointer',
            appearance: 'none',
            WebkitAppearance: 'none',
            borderRadius: '2px',
            background: 'rgba(255,255,255,0.3)',
            outline: 'none',
          } as React.CSSProperties & {WebkitAppearance: string}}
        />

        <button
          onClick={() => {
            if (videoRef.current) {
              videoRef.current.requestFullscreen?.();
            }
          }}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            padding: '6px 10px',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 'bold',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.3)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.2)';
          }}
        >
          ⛶
        </button>
      </div>

      {isPlaying && frameReady && previewUrl && (
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            background: 'rgba(0, 0, 0, 0.68)',
            color: '#fff',
            padding: '0.45rem 0.8rem',
            borderRadius: 8,
            fontFamily: 'Anton, Helvetica, Arial, sans-serif',
            fontWeight: 700,
            fontSize: '0.95rem',
            lineHeight: 1.2,
            maxWidth: 'calc(100% - 24px)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 2,
          }}
        >
          {['ReplayTrove Preview', 'HD Version Available After Purchase'][overlayIndex]}
        </div>
      )}
      </div>
    </>
  );
}
