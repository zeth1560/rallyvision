'use client';

import { useState } from 'react';
import { parseJsonResponse } from '@/lib/parse-json-response';

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
      const resetResponse = await fetch('/api/admin/pb-vision-requests/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      const resetResult = await parseJsonResponse<{ error?: string }>(resetResponse);

      if (!resetResponse.ok) {
        setError(resetResult.error || 'Reset failed');
        return;
      }

      setMessage('Preparing and submitting video — this may take several minutes…');

      const submitResponse = await fetch('/api/admin/pb-vision-requests/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId }),
      });
      const submitResult = await parseJsonResponse<{
        error?: string;
        pbv_vid?: string;
      }>(submitResponse);

      if (!submitResponse.ok) {
        setError(submitResult.error || 'Submit failed');
        window.setTimeout(() => window.location.reload(), 1500);
        return;
      }

      setMessage(
        submitResult.pbv_vid
          ? `Submitted successfully (PBV VID: ${submitResult.pbv_vid})`
          : 'Submitted successfully'
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
        {loading ? 'Submitting…' : 'Reset and resubmit'}
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
