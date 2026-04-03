'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import { createClient } from '@/lib/supabase/client';

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    await supabase.auth.getSession();

    router.replace('/admin/dashboard');
    router.refresh();
  }

  return (
    <ReplayTrovePageShell
      title="Admin Login"
      subtitle="Secure access for ReplayTrove administrators and club operators."
      maxWidth="1200px"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.05fr) minmax(340px, 0.95fr)',
          gap: '24px',
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '28px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              padding: '6px 12px',
              borderRadius: '999px',
              background: '#f3f4f6',
              color: '#444',
              fontSize: '0.85rem',
              fontWeight: 700,
              marginBottom: '18px',
              width: 'fit-content',
            }}
          >
            ReplayTrove Admin
          </div>

          <h2
            style={{
              marginTop: 0,
              marginBottom: '14px',
              fontSize: '2rem',
              lineHeight: 1.15,
              color: '#17191c',
            }}
          >
            Welcome back.
          </h2>

          <p
            style={{
              marginTop: 0,
              marginBottom: '18px',
              color: '#555',
              lineHeight: 1.6,
              fontSize: '1rem',
            }}
          >
            Sign in to manage clips, review recent activity, and access club-only
            downloads without touching the public checkout flow.
          </p>

          <div
            style={{
              border: '1px solid #ececec',
              borderRadius: '14px',
              background: '#f8f8f8',
              padding: '18px',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: '#17191c',
                marginBottom: '10px',
              }}
            >
              From the admin area, you can:
            </div>

            <ul
              style={{
                margin: 0,
                paddingLeft: '20px',
                color: '#555',
                lineHeight: 1.7,
              }}
            >
              <li>Browse and preview recent clips</li>
              <li>Download clips without payment</li>
              <li>Access club-specific media libraries</li>
              <li>Monitor the system from a central dashboard</li>
            </ul>
          </div>
        </div>

        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '28px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: '18px',
              fontSize: '1.4rem',
              color: '#17191c',
            }}
          >
            Sign In
          </h2>

          <form
            onSubmit={handleSubmit}
            style={{ display: 'grid', gap: '16px' }}
          >
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

            <div>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 700,
                  color: '#17191c',
                }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
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
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '12px 16px',
                borderRadius: '10px',
                border: 'none',
                background: loading ? '#444' : '#111111',
                color: '#ffffff',
                fontSize: '1rem',
                fontWeight: 700,
                cursor: loading ? 'default' : 'pointer',
              }}
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </ReplayTrovePageShell>
  );
}