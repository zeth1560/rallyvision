'use client';

import { useState } from 'react';

export default function DownloadAllButton({
  sessionId,
}: {
  sessionId: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleDownload = () => {
    setLoading(true);

    // trigger download
    window.location.href = `/api/download-all?session_id=${encodeURIComponent(
      sessionId
    )}`;

    // fallback reset (in case user stays on page)
    setTimeout(() => {
      setLoading(false);
    }, 4000);
  };

  return (
    <div style={{ display: 'grid', gap: '6px' }}>
      <button
        onClick={handleDownload}
        disabled={loading}
        style={{
          padding: '10px 14px',
          borderRadius: '10px',
          background: loading ? '#555' : '#111',
          color: '#fff',
          border: 'none',
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Preparing download...' : 'Download All Clips'}
      </button>

      {loading && (
        <span style={{ fontSize: '0.85rem', color: '#666' }}>
          Zipping clips... this can take a few seconds
        </span>
      )}
    </div>
  );
}