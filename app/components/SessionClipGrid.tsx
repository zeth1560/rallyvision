'use client';

import { useEffect, useMemo, useState } from 'react';
import SessionPreview from '@/app/components/SessionPreview';

type Clip = {
  id: string;
  title: string;
  slug: string;
  price_cents: number;
  recorded_at?: string | null;
};

type Props = {
  clips: Clip[];
  bookingId: string;
  bookingDisplay: string;
};

const CLUB_TIME_ZONE = 'America/Chicago';

function formatClipTime(recordedAt: string, timeZone = CLUB_TIME_ZONE) {
  const date = new Date(recordedAt);

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  });
}

export default function SessionClipGrid({
  clips,
  bookingId,
  bookingDisplay,
}: Props) {
  const storageKey = `replaytrove-cart-${bookingId}`;

  const [cart, setCart] = useState<string[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);

  useEffect(() => {
    try {
      const legacyKey = `rallyvision-cart-${bookingId}`;
      const saved =
        localStorage.getItem(storageKey) || localStorage.getItem(legacyKey);

      if (saved) {
        setCart(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load cart from localStorage:', error);
    } finally {
      setCartLoaded(true);
    }
  }, [storageKey, bookingId]);

  useEffect(() => {
    if (!cartLoaded) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch (error) {
      console.error('Failed to save cart to localStorage:', error);
    }
  }, [cart, storageKey, cartLoaded]);

  function toggleCart(clipId: string) {
    setCart((current) =>
      current.includes(clipId)
        ? current.filter((id) => id !== clipId)
        : [...current, clipId]
    );
  }

  function clearCart() {
    setCart([]);
  }

  function isInCart(clipId: string) {
    return cart.includes(clipId);
  }

  const total = useMemo(() => {
    return cart.reduce((sum, id) => {
      const clip = clips.find((c) => c.id === id);
      return sum + (clip?.price_cents || 0);
    }, 0);
  }, [cart, clips]);

  async function handleCheckout() {
    try {
      const response = await fetch('/api/create-cart-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipIds: cart, bookingId }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Checkout failed');
        console.error(data);
      }
    } catch (err) {
      console.error(err);
      alert('Something went wrong starting checkout');
    }
  }

  return (
    <>
      <style jsx>{`
        .session-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 24px;
          align-items: start;
        }

        .clips-column {
          min-width: 0;
        }

        .clips-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }

        .clips-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .clip-card,
        .cart-card {
          border: 1px solid #dedede;
          border-radius: 16px;
          background: #ffffff;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.07);
        }

        .clip-card {
          padding: 16px;
          min-width: 0;
        }

        .clip-meta-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-top: 6px;
        }

        .clip-meta-main {
          flex: 1;
          min-width: 0;
        }

        .clip-title {
          margin: 0;
          font-size: 1.05rem;
          line-height: 1.3;
          color: #17191c;
          word-break: break-word;
        }

        .clip-subtitle {
          margin: 6px 0 0;
          font-size: 0.85rem;
          color: #666;
          word-break: break-word;
        }

        .clip-price {
          flex-shrink: 0;
          font-size: 1.2rem;
          font-weight: 800;
          color: #111;
          white-space: nowrap;
        }

        .clip-button {
          width: 100%;
          margin-top: 14px;
          padding: 0.85rem 1rem;
          color: #ffffff;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
          font-size: 0.96rem;
          line-height: 1.2;
        }

        .clip-button.add {
          background: linear-gradient(135deg, #111315 0%, #25282d 100%);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
        }

        .clip-button.remove {
          background: #3b3f45;
          box-shadow: none;
        }

        .cart-column {
          min-width: 0;
        }

        .cart-card {
          padding: 18px;
          height: fit-content;
          position: sticky;
          top: 20px;
        }

        .cart-list {
          padding-left: 18px;
          margin-top: 14px;
          margin-bottom: 14px;
        }

        .cart-list-item {
          margin-bottom: 10px;
          color: #222;
          word-break: break-word;
        }

        .cart-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .checkout-button,
        .clear-button {
          width: 100%;
          border-radius: 10px;
          cursor: pointer;
        }

        .checkout-button {
          padding: 0.9rem 1rem;
          background: linear-gradient(135deg, #e24d1d 0%, #c92e1b 100%);
          color: #ffffff;
          border: none;
          font-weight: 800;
          font-size: 0.97rem;
          box-shadow: 0 8px 18px rgba(201, 46, 27, 0.22);
        }

        .clear-button {
          padding: 0.85rem 1rem;
          background: #fff;
          color: #111;
          border: 1px solid #ccc;
          font-weight: 700;
          font-size: 0.95rem;
        }

        @media (max-width: 980px) {
          .session-layout {
            grid-template-columns: 1fr;
          }

          .cart-column {
            order: -1;
          }

          .cart-card {
            position: static;
            top: auto;
          }
        }

        @media (max-width: 700px) {
          .clips-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .clips-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .clip-card {
            padding: 14px;
          }

          .clip-meta-row {
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
          }

          .clip-price {
            font-size: 1.05rem;
            white-space: normal;
          }

          .cart-card {
            padding: 16px;
          }
        }
      `}</style>

      <div className="session-layout">
        <div className="clips-column">
          <div className="clips-header">
            <h2
              style={{
                margin: 0,
                fontSize: '1.35rem',
                color: '#16181b',
              }}
            >
              Available Clips
            </h2>

            <div
              style={{
                fontSize: '0.95rem',
                color: '#555',
                fontWeight: 600,
              }}
            >
              {clips.length} clip{clips.length === 1 ? '' : 's'}
            </div>
          </div>

          {clips.length === 0 ? (
            <div
              className="clip-card"
              style={{
                color: '#555',
              }}
            >
              No clips are available for this session yet.
            </div>
          ) : (
            <div className="clips-grid">
              {clips.map((clip) => (
                <div key={clip.id} className="clip-card">
                  <SessionPreview slug={clip.slug} />

                  <div className="clip-meta-row">
                    <div className="clip-meta-main">
                      <h3 className="clip-title">
                        {clip.recorded_at
                          ? formatClipTime(clip.recorded_at)
                          : clip.title || 'Clip'}
                      </h3>

                      {clip.recorded_at ? null : (
                        <p className="clip-subtitle">{clip.title}</p>
                      )}
                    </div>

                    <div className="clip-price">
                      ${(clip.price_cents / 100).toFixed(2)}
                    </div>
                  </div>

                  <button
                    onClick={() => toggleCart(clip.id)}
                    className={`clip-button ${
                      isInCart(clip.id) ? 'remove' : 'add'
                    }`}
                  >
                    {isInCart(clip.id) ? 'Remove from Cart' : 'Add to Cart'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cart-column">
          <div className="cart-card">
            <h2
              style={{
                marginTop: 0,
                marginBottom: '8px',
                fontSize: '1.3rem',
                color: '#16181b',
                wordBreak: 'break-word',
              }}
            >
              Cart
              {cart.length > 0
                ? ` (${cart.length} clip${cart.length === 1 ? '' : 's'})`
                : ''}
            </h2>

            {cart.length === 0 ? (
              <p style={{ marginTop: '12px', color: '#666' }}>
                Your cart is empty.
              </p>
            ) : (
              <>
                <ul className="cart-list">
                  {cart.map((id) => {
                    const clip = clips.find((c) => c.id === id);
                    return (
                      <li key={id} className="cart-list-item">
                        {clip?.recorded_at
                          ? formatClipTime(clip.recorded_at)
                          : clip?.title || 'Clip'}{' '}
                        - ${((clip?.price_cents || 0) / 100).toFixed(2)}
                      </li>
                    );
                  })}
                </ul>

                <div
                  style={{
                    borderTop: '1px solid #e5e5e5',
                    paddingTop: '14px',
                    marginTop: '10px',
                  }}
                >
                  <p
                    style={{
                      fontWeight: 800,
                      fontSize: '1.05rem',
                      margin: '0 0 16px',
                      color: '#111',
                    }}
                  >
                    Total: ${(total / 100).toFixed(2)}
                  </p>

                  <div className="cart-actions">
                    <button
                      onClick={handleCheckout}
                      className="checkout-button"
                    >
                      Checkout
                    </button>

                    <button onClick={clearCart} className="clear-button">
                      Clear Cart
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}