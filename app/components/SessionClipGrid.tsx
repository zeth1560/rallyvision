'use client';

import { useEffect, useMemo, useState } from 'react';
import SessionPreview from '@/app/components/SessionPreview';

type Clip = {
  id: string;
  title: string;
  slug: string;
  price_cents: number;
};

type Props = {
  clips: Clip[];
  bookingId: string;
  bookingDisplay: string;
};

export default function SessionClipGrid({
  clips,
  bookingId,
  bookingDisplay,
}: Props) {
  const storageKey = `rallyvision-cart-${bookingId}`;

  const [cart, setCart] = useState<string[]>([]);
  const [cartLoaded, setCartLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setCart(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load cart from localStorage:', error);
    } finally {
      setCartLoaded(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!cartLoaded) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch (error) {
      console.error('Failed to save cart to localStorage:', error);
    }
  }, [cart, storageKey, cartLoaded]);

  function toggleCart(clipId: string) {
    if (cart.includes(clipId)) {
      setCart(cart.filter((id) => id !== clipId));
    } else {
      setCart([...cart, clipId]);
    }
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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 360px',
        gap: '24px',
        alignItems: 'start',
      }}
    >
      {/* LEFT: Clips */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
          }}
        >
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: '18px',
          }}
        >
          {clips.map((clip) => (
            <div
              key={clip.id}
              style={{
                border: '1px solid #dedede',
                borderRadius: '16px',
                padding: '16px',
                background: '#ffffff',
                boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
              }}
            >
              <SessionPreview slug={clip.slug} />

              <div
                style={{
                  display: 'flex',
                  alignItems: 'start',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginTop: '6px',
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.05rem',
                    lineHeight: 1.3,
                    color: '#17191c',
                  }}
                >
                  {clip.title || 'Clip'}
                </h3>

                <div
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    color: '#111',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ${(clip.price_cents / 100).toFixed(2)}
                </div>
              </div>

              <button
                onClick={() => toggleCart(clip.id)}
                style={{
                  width: '100%',
                  marginTop: '14px',
                  padding: '0.85rem',
                  background: isInCart(clip.id)
                    ? '#3b3f45'
                    : 'linear-gradient(135deg, #111315 0%, #25282d 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.96rem',
                  boxShadow: isInCart(clip.id)
                    ? 'none'
                    : '0 6px 16px rgba(0,0,0,0.18)',
                }}
              >
                {isInCart(clip.id) ? 'Remove from Cart' : 'Add to Cart'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Cart */}
      <div
        style={{
          border: '1px solid #dedede',
          borderRadius: '16px',
          padding: '18px',
          height: 'fit-content',
          background: '#ffffff',
          boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
          position: 'sticky',
          top: '20px',
        }}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: '8px',
            fontSize: '1.3rem',
            color: '#16181b',
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
            <ul
              style={{
                paddingLeft: '18px',
                marginTop: '14px',
                marginBottom: '14px',
              }}
            >
              {cart.map((id) => {
                const clip = clips.find((c) => c.id === id);
                return (
                  <li key={id} style={{ marginBottom: '10px', color: '#222' }}>
                    {clip?.title || 'Clip'} — $
                    {((clip?.price_cents || 0) / 100).toFixed(2)}
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

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <button
                  onClick={handleCheckout}
                  style={{
                    width: '100%',
                    padding: '0.9rem',
                    background:
                      'linear-gradient(135deg, #e24d1d 0%, #c92e1b 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontSize: '0.97rem',
                    boxShadow: '0 8px 18px rgba(201,46,27,0.22)',
                  }}
                >
                  Checkout
                </button>

                <button
                  onClick={clearCart}
                  style={{
                    width: '100%',
                    padding: '0.85rem',
                    background: '#fff',
                    color: '#111',
                    border: '1px solid #ccc',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                  }}
                >
                  Clear Cart
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}