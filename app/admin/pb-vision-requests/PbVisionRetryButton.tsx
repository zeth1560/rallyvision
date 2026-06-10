'use client';

import { useState } from 'react';

export default function PbVisionRetryButton({
  requestId,
  disabled = false,
}: {
  requestId: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReset() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch('/api/admin/pb-vision-requests/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Reset failed');
        return;
      }

      setMessage(
        result.pbv_vid
          ? `Resubmitted successfully (PBV VID: ${result.pbv_vid})`
          : 'Reset and resubmitted successfully'
      );
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: '12px' }}>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={handleReset}
        style={{
          padding: '8px 12px',
          borderRadius: '8px',
          border: 'none',
          background: '#111111',
          color: '#ffffff',
          fontWeight: 700,
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          opacity: disabled || loading ? 0.65 : 1,
        }}
      >
        {loading ? 'Resetting...' : 'Reset and resubmit'}
      </button>
      {message ? (
        <p style={{ margin: '8px 0 0', color: '#198754', fontSize: '0.9rem' }}>{message}</p>
      ) : null}
      {error ? (
        <p style={{ margin: '8px 0 0', color: '#b00020', fontSize: '0.9rem' }}>{error}</p>
      ) : null}
    </div>
  );
}
