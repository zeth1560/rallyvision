'use client';

import { useEffect, useState } from 'react';

type SessionPreviewProps = {
  slug: string;
};

export default function SessionPreview({ slug }: SessionPreviewProps) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isActive = true;

    async function loadPreview() {
      try {
        setLoading(true);
        setError('');
        setPreviewUrl('');

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
      }}
    >
      <video
        controls
        preload="metadata"
        playsInline
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