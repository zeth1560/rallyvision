'use client';

import { useState } from 'react';

type BuyButtonProps = {
  clipId: string;
  isFree?: boolean;
};

const CHECKOUT_EMAIL_REQUIRED_MESSAGE =
  'Please enter your email address to continue to checkout.';

function normalizeCheckoutEmailInput(value: string) {
  return value.trim().toLowerCase();
}

function isValidCheckoutEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function BuyButton({ clipId, isFree = false }: BuyButtonProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handlePaidClick() {
    const normalizedEmail = normalizeCheckoutEmailInput(email);

    if (!normalizedEmail) {
      setError(CHECKOUT_EMAIL_REQUIRED_MESSAGE);
      return;
    }

    if (!isValidCheckoutEmail(normalizedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

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
        body: JSON.stringify({
          clipId,
          email: normalizedEmail,
        }),
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

      if (data.errorCode === 'CHECKOUT_EMAIL_REQUIRED') {
        setError(CHECKOUT_EMAIL_REQUIRED_MESSAGE);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Something went wrong creating checkout. Check browser console and terminal.');
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
    const normalizedEmail = normalizeCheckoutEmailInput(email);

    if (!normalizedEmail) {
      setError(CHECKOUT_EMAIL_REQUIRED_MESSAGE);
      return;
    }

    if (!isValidCheckoutEmail(normalizedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('[BuyButton] handleFreeClick triggered', {
        clipId,
        email: normalizedEmail,
        timestamp: new Date().toISOString(),
      });

      const response = await fetch('/api/player-trove/claim-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
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
        email: normalizedEmail,
        timestamp: new Date().toISOString(),
        note: 'player_video_access record created with access_source=free_pilot',
      });

      setSuccess(true);
      const redirectUrl =
        typeof data.redirect_url === 'string' && data.redirect_url
          ? data.redirect_url
          : `/player-trove?email=${encodeURIComponent(normalizedEmail)}`;

      setTimeout(() => {
        window.location.href = redirectUrl;
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
      <div style={{ marginTop: '1rem' }}>
        <label
          htmlFor={`buy-email-${clipId}`}
          style={{
            display: 'block',
            fontSize: '0.9rem',
            fontWeight: 600,
            marginBottom: '0.5rem',
          }}
        >
          Email Address (required)
        </label>
        <input
          id={`buy-email-${clipId}`}
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          required
          autoComplete="email"
          style={{
            width: '100%',
            padding: '0.75rem',
            marginBottom: '0.75rem',
            border: '1px solid #ccc',
            borderRadius: '6px',
            fontSize: '1rem',
            boxSizing: 'border-box',
            opacity: loading ? 0.7 : 1,
          }}
        />
        <button
          onClick={handlePaidClick}
          disabled={loading}
          style={{
            width: '100%',
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

  return (
    <div style={{ marginTop: '1rem' }}>
      <label
        htmlFor={`claim-email-${clipId}`}
        style={{
          display: 'block',
          fontSize: '0.9rem',
          fontWeight: 600,
          marginBottom: '0.5rem',
        }}
      >
        Email Address (required)
      </label>
      <input
        id={`claim-email-${clipId}`}
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading || success}
        required
        autoComplete="email"
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
