'use client';

import { useState } from 'react';
import { parseJsonResponse } from '@/lib/parse-json-response';

export default function PbVisionRetryButton({
  requestId,
  status,
  disabled = false,
}: {
  requestId: string;
  status: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isStuck =
    status === 'requested' || status === 'processing';
  const label = isStuck ? 'Retry submission' : 'Reset and resubmit';

  async function handleRetry() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      setMessage('Submitting to PB Vision…');

      const response = await fetch('/api/admin/pb-vision-requests/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      const result = await parseJsonResponse<{
        error?: string;
        pbv_vid?: string;
      }>(response);

      if (!response.ok) {
        setError(result.error || 'Retry failed');
        window.setTimeout(() => window.location.reload(), 1500);
        return;
      }

      setMessage(
        result.pbv_vid
          ? `Submitted successfully (PBV VID: ${result.pbv_vid})`
          : 'Submitted successfully'
      );
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: '12px' }}>
      {isStuck ? (
        <p style={{ margin: '0 0 8px', color: '#856404', fontSize: '0.9rem' }}>
          This request appears stuck. Click retry to run submission again.
        </p>
      ) : null}
      <button
        type="button"
        disabled={disabled || loading}
        onClick={handleRetry}
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
        {loading ? 'Submitting…' : label}
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
