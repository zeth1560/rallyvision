'use client';

import { useState } from 'react';

type BuyButtonProps = {
  clipId: string;
  isFree?: boolean;
};

export default function BuyButton({ clipId, isFree = false }: BuyButtonProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handlePaidClick() {
    try {
      setLoading(true);
      setError(null);

      console.log('[BuyButton] handlePaidClick triggered', {
        clipId,
        isFree,
        timestamp: new Date().toISOString(),
      });

      if (isFree) {
        console.error('[SECURITY] Paid checkout called for FREE clip - should use handleFreeClick instead!', {
          clipId,
          isFree,
          timestamp: new Date().toISOString(),
        });
        setError('Error: This clip should be claimed using the free access flow. Please refresh the page.');
        return;
      }

      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId }),
      });

      const text = await response.text();
      console.log('Raw response text:', text);

      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
      }

      console.log('Parsed response data:', data);
      console.log('Response status:', response.status);

      if (data.errorCode === 'FREE_CLIP_BYPASS_ATTEMPT') {
        console.error('[SECURITY] Backend rejected free clip checkout attempt', data);
        setError('This clip is free and must be claimed with your email instead. Please use the "Claim Free Access" button.');
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError('Something went wrong creating checkout. Check browser console and terminal.');
        console.error('Checkout error response:', data);
      }
    } catch (error) {
      setError('Fetch failed. Check browser console and terminal.');
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleFreeClick() {
    if (!email || !email.trim()) {
      setError('Please enter your email address');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('[BuyButton] handleFreeClick triggered', {
        clipId,
        email: email.trim().toLowerCase(),
        timestamp: new Date().toISOString(),
      });

      const response = await fetch('/api/player-trove/claim-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          clip_id: clipId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[BuyButton] Free claim failed', {
          status: response.status,
          error: data.error,
          clipId,
        });
        setError(data.error || 'Failed to claim free access');
        return;
      }

      console.log('[BuyButton] Free claim succeeded', {
        clipId,
        email: email.trim().toLowerCase(),
        timestamp: new Date().toISOString(),
        note: 'player_video_access record created with access_source=free_pilot',
      });

      setSuccess(true);
      const normalizedEmail = email.trim().toLowerCase();
      // Navigate to player-trove with email after 2 seconds
      setTimeout(() => {
        window.location.href = `/player-trove?email=${encodeURIComponent(normalizedEmail)}`;
      }, 2000);
    } catch (error) {
      console.error('[BuyButton] Free claim error:', error);
      setError('Fetch failed. Check browser console.');
    } finally {
      setLoading(false);
    }
  }

  if (!isFree) {
    return (
      <button
        onClick={handlePaidClick}
        disabled={loading}
        style={{
          marginTop: '1rem',
          padding: '0.75rem 1.25rem',
          background: loading ? '#666' : 'black',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Loading...' : 'Buy Download'}
      </button>
    );
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading || success}
        style={{
          width: '100%',
          padding: '0.75rem',
          marginBottom: '0.75rem',
          border: '1px solid #ccc',
          borderRadius: '6px',
          fontSize: '1rem',
          boxSizing: 'border-box',
          opacity: loading || success ? 0.7 : 1,
        }}
      />
      <button
        onClick={handleFreeClick}
        disabled={loading || success}
        style={{
          width: '100%',
          padding: '0.75rem 1.25rem',
          background: success ? '#4caf50' : loading ? '#666' : 'black',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: loading || success ? 'not-allowed' : 'pointer',
          opacity: loading || success ? 0.7 : 1,
        }}
      >
        {loading ? 'Processing...' : success ? '✓ Access Claimed' : 'Claim Free Access'}
      </button>
      {error && (
        <p
          style={{
            color: '#d32f2f',
            fontSize: '0.875rem',
            marginTop: '0.5rem',
            margin: '0.5rem 0 0 0',
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}