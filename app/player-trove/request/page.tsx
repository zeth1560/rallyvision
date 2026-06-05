'use client';

import { useState } from 'react';
import Link from 'next/link';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';

export default function PlayerTroveRequestPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/player-trove/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setSuccessMessage(
        data.message ||
          'If videos are available for that email, a PlayerTrove link has been sent.'
      );
      setEmail('');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ReplayTrovePageShell
      title="PlayerTrove Access"
      subtitle="Enter your email and we will send you a secure link to your videos."
      maxWidth="720px"
    >
      <div
        style={{
          border: '1px solid #dedede',
          borderRadius: '16px',
          padding: '28px',
          background: '#ffffff',
          boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: 700,
                color: '#17191c',
              }}
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading || !!successMessage}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid #cfcfcf',
                fontSize: '1rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: '#fff1f1',
                border: '1px solid #f1c5c5',
                color: '#a12626',
                fontSize: '0.95rem',
              }}
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {successMessage ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                color: '#166534',
                fontSize: '0.95rem',
                lineHeight: 1.5,
              }}
              role="status"
            >
              {successMessage}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading || !!successMessage}
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              border: 'none',
              background: loading ? '#444' : '#111111',
              color: '#ffffff',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: loading || successMessage ? 'default' : 'pointer',
              opacity: loading || successMessage ? 0.7 : 1,
            }}
          >
            {loading ? 'Sending...' : 'Send My PlayerTrove Link'}
          </button>
        </form>

        {successMessage ? (
          <button
            type="button"
            onClick={() => {
              setSuccessMessage(null);
              setError(null);
            }}
            style={{
              marginTop: '16px',
              padding: 0,
              border: 'none',
              background: 'none',
              color: '#007bff',
              cursor: 'pointer',
              fontSize: '0.95rem',
              textDecoration: 'underline',
            }}
          >
            Send another link
          </button>
        ) : null}

        <p
          style={{
            marginTop: '20px',
            marginBottom: 0,
            color: '#666',
            fontSize: '0.9rem',
            lineHeight: 1.5,
          }}
        >
          Links expire after 24 hours. Use the same email you used when claiming or
          purchasing clips.
        </p>
      </div>
    </ReplayTrovePageShell>
  );
}
