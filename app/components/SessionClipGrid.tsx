'use client';

import { useEffect, useMemo, useState } from 'react';
import SessionPreview from '@/app/components/SessionPreview';
import { formatDuration } from '@/lib/format';
import {
  addAllClipsBaseToCart,
  calculateCartTotalCents,
  cartHasItems,
  clipHasProduct,
  emptyCartPayload,
  getCartClipIds,
  isClipInCart,
  migrateStoredCart,
  PRODUCT_LABELS,
  setSessionBundle,
  toggleFullGameProduct,
  toggleShortClipInCart,
  type CartPayload,
  type SessionBundleQuoteClient,
  type SessionClipPricingClient,
} from '@/lib/commerce/cart-payload';
import {
  SESSION_COACH_REVIEW_ADDON_ENABLED,
  type ProductType,
} from '@/lib/commerce/products';

type SessionClip = {
  id: string;
  title: string;
  slug: string;
  recorded_at?: string | null;
  created_at?: string | null;
  duration_seconds?: number | null;
  basePriceCents: number;
  pbVisionPriceCents: number;
  coachReviewPriceCents: number;
  isFullGame: boolean;
  baseProduct: ProductType;
};

type Props = {
  clips: SessionClip[];
  clipPricing: SessionClipPricingClient[];
  bundleQuote: SessionBundleQuoteClient;
  bookingId: string;
  bookingDisplay: string;
  daysRemaining?: number;
};

const CLUB_TIME_ZONE = 'America/Chicago';

function formatClipTime(recordedAt: string, timeZone = CLUB_TIME_ZONE) {
  return new Date(recordedAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  });
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

const CHECKOUT_EMAIL_REQUIRED_MESSAGE =
  'Please enter your email address to continue to checkout.';

function normalizeCheckoutEmailInput(value: string) {
  return value.trim().toLowerCase();
}

function isValidCheckoutEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function stripCoachReviewFromCart(cart: CartPayload): CartPayload {
  if (SESSION_COACH_REVIEW_ADDON_ENABLED) {
    return cart;
  }

  return {
    ...cart,
    lines: cart.lines
      .map((line) => ({
        ...line,
        products: line.products.filter((product) => product !== 'coach_review'),
      }))
      .filter((line) => line.products.length > 0),
  };
}

function formatClipLabel(clip: SessionClip) {
  const durationLabel = clip.duration_seconds
    ? ` | ${formatDuration(clip.duration_seconds)}`
    : '';

  if (clip.recorded_at) {
    return `${formatClipTime(clip.recorded_at)}${durationLabel}`;
  }

  return `${clip.title || 'Clip'}${durationLabel}`;
}

export default function SessionClipGrid({
  clips,
  clipPricing,
  bundleQuote,
  bookingId,
  daysRemaining = 30,
}: Props) {
  const storageKey = `replaytrove-cart-${bookingId}`;

  const [cart, setCart] = useState<CartPayload>(() => emptyCartPayload(bookingId));
  const [cartLoaded, setCartLoaded] = useState(false);
  const [checkoutEmail, setCheckoutEmail] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoDiscountCents, setPromoDiscountCents] = useState(0);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const pricingByClipId = useMemo(
    () => new Map(clipPricing.map((pricing) => [pricing.id, pricing])),
    [clipPricing]
  );

  useEffect(() => {
    try {
      const legacyKey = `rallyvision-cart-${bookingId}`;
      const saved =
        localStorage.getItem(storageKey) || localStorage.getItem(legacyKey);

      if (saved) {
        setCart(
          stripCoachReviewFromCart(
            migrateStoredCart(JSON.parse(saved), clipPricing, bookingId)
          )
        );
      }
    } catch (error) {
      console.error('Failed to load cart from localStorage:', error);
    } finally {
      setCartLoaded(true);
    }
  }, [storageKey, bookingId, clipPricing]);

  useEffect(() => {
    if (!cartLoaded) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch (error) {
      console.error('Failed to save cart to localStorage:', error);
    }
  }, [cart, storageKey, cartLoaded]);

  const totalCents = useMemo(
    () => calculateCartTotalCents(cart, pricingByClipId, bundleQuote),
    [cart, pricingByClipId, bundleQuote]
  );

  const isCartAllFree = cartHasItems(cart) && totalCents === 0;
  const isCartPaid = cartHasItems(cart) && totalCents > 0;

  function clearCart() {
    setCart(emptyCartPayload(bookingId));
  }

  function handleAddAll() {
    setCart((current) => addAllClipsBaseToCart(current, clipPricing));
  }

  function handleBundleToggle(enabled: boolean) {
    setCart((current) => setSessionBundle(current, enabled));
  }

  function buildPromoPriceLines() {
    const lines: Array<{
      clip_id?: string;
      product_type: string;
      original_amount_cents: number;
    }> = [];

    if (cart.sessionBundle && bundleQuote.showBundle) {
      lines.push({
        product_type: 'session_bundle',
        original_amount_cents: bundleQuote.bundlePriceCents,
      });
    }

    for (const line of cart.lines) {
      const pricing = pricingByClipId.get(line.clipId);
      if (!pricing) continue;

      for (const product of line.products) {
        if (
          cart.sessionBundle &&
          (product === 'clip_download' || product === 'full_game_hd')
        ) {
          continue;
        }

        const amount =
          product === 'pb_vision'
            ? pricing.pbVisionPriceCents
            : product === 'coach_review'
              ? pricing.coachReviewPriceCents
              : pricing.basePriceCents;

        lines.push({
          clip_id: line.clipId,
          product_type: product,
          original_amount_cents: amount,
        });
      }
    }

    return lines;
  }

  async function handleApplyPromo() {
    setPromoMessage(null);
    setPromoDiscountCents(0);

    if (!promoCode.trim()) {
      return;
    }

    if (!cartHasItems(cart)) {
      setPromoMessage('Add items to your cart before applying a promo code.');
      return;
    }

    try {
      const response = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: promoCode.trim(),
          email: checkoutEmail.trim() || undefined,
          price_lines: buildPromoPriceLines(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPromoMessage(data.error || 'Invalid promo code');
        return;
      }

      setPromoDiscountCents(data.discount_total_cents ?? 0);
      setPromoMessage(`${data.code}: ${data.discount_label} applied`);
    } catch {
      setPromoMessage('Failed to validate promo code');
    }
  }

  async function handleCheckout() {
    try {
      setCheckoutError(null);
      setIsCheckingOut(true);

      if (!cartHasItems(cart)) {
        setCheckoutError('Your cart is empty');
        return;
      }

      if (isCartAllFree) {
        const normalizedEmail = normalizeCheckoutEmailInput(checkoutEmail);

        if (!normalizedEmail) {
          setCheckoutError(CHECKOUT_EMAIL_REQUIRED_MESSAGE);
          return;
        }

        if (!isValidCheckoutEmail(normalizedEmail)) {
          setCheckoutError('Please enter a valid email address.');
          return;
        }

        const response = await fetch('/api/checkout/free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: normalizedEmail,
            session_bundle: cart.sessionBundle || undefined,
            booking_id: cart.sessionBundle ? bookingId : undefined,
            clip_ids: cart.sessionBundle ? undefined : getCartClipIds(cart),
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setCheckoutError(data.error || 'Checkout failed');
          return;
        }

        if (data.redirect_url) {
          window.location.href = data.redirect_url;
        } else {
          setCheckoutError('Checkout completed but no redirect URL provided');
        }

        return;
      }

      const normalizedEmail = normalizeCheckoutEmailInput(checkoutEmail);

      if (!normalizedEmail) {
        setCheckoutError(CHECKOUT_EMAIL_REQUIRED_MESSAGE);
        return;
      }

      if (!isValidCheckoutEmail(normalizedEmail)) {
        setCheckoutError('Please enter a valid email address.');
        return;
      }

      const response = await fetch('/api/create-cart-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          cart,
          promoCode: promoCode.trim() || undefined,
          email: normalizedEmail,
        }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.errorCode === 'CHECKOUT_EMAIL_REQUIRED') {
        setCheckoutError(CHECKOUT_EMAIL_REQUIRED_MESSAGE);
      } else {
        setCheckoutError(data.error || 'Checkout failed');
      }
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'Something went wrong starting checkout'
      );
    } finally {
      setIsCheckingOut(false);
    }
  }

  function renderCartLineItems() {
    const items: string[] = [];

    if (cart.sessionBundle && bundleQuote.showBundle) {
      items.push(
        `Session Bundle (${bundleQuote.billedHours} hr) — ${formatCents(bundleQuote.bundlePriceCents)}`
      );
    }

    for (const line of cart.lines) {
      const clip = clips.find((entry) => entry.id === line.clipId);
      if (!clip) continue;

      for (const product of line.products) {
        if (
          cart.sessionBundle &&
          (product === 'clip_download' || product === 'full_game_hd')
        ) {
          continue;
        }

        const pricing = pricingByClipId.get(line.clipId);
        const amount = pricing
          ? product === 'pb_vision'
            ? pricing.pbVisionPriceCents
            : product === 'coach_review'
              ? pricing.coachReviewPriceCents
              : pricing.basePriceCents
          : 0;

        items.push(
          `${formatClipLabel(clip)} — ${PRODUCT_LABELS[product]} — ${formatCents(amount)}`
        );
      }
    }

    return items;
  }

  const cartLineItems = renderCartLineItems();

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
          flex-wrap: wrap;
        }

        .clips-header-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .add-all-button {
          padding: 0.65rem 1.2rem;
          background: linear-gradient(135deg, #111315 0%, #25282d 100%);
          color: #ffffff;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 700;
          font-size: 0.9rem;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
          white-space: nowrap;
        }

        .retention-banner {
          background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
          border: 1px solid #ffc107;
          border-radius: 12px;
          padding: 16px 18px;
          margin-bottom: 24px;
          color: #856404;
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

        .clip-title {
          margin: 0;
          font-size: 1.05rem;
          line-height: 1.3;
          color: #17191c;
        }

        .clip-price {
          flex-shrink: 0;
          font-size: 1.1rem;
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
        }

        .clip-button.add {
          background: linear-gradient(135deg, #111315 0%, #25282d 100%);
        }

        .clip-button.remove {
          background: #3b3f45;
        }

        .product-options {
          margin-top: 14px;
          display: grid;
          gap: 8px;
        }

        .product-option {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 0.9rem;
          color: #333;
        }

        .product-option input {
          margin-top: 3px;
        }

        .product-option.disabled {
          opacity: 0.55;
        }

        .bundle-note {
          margin-top: 10px;
          font-size: 0.85rem;
          color: #0d6efd;
          font-weight: 600;
        }

        .cart-column {
          min-width: 0;
        }

        .cart-card {
          padding: 18px;
          position: sticky;
          top: 20px;
        }

        .cart-list {
          padding-left: 18px;
          margin: 14px 0;
        }

        .cart-list-item {
          margin-bottom: 10px;
          color: #222;
          word-break: break-word;
          font-size: 0.92rem;
        }

        .bundle-offer {
          border: 1px solid #b8daff;
          background: #f3f9ff;
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 14px;
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
        }

        .clear-button {
          padding: 0.85rem 1rem;
          background: #fff;
          color: #111;
          border: 1px solid #ccc;
          font-weight: 700;
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
          }
        }

        @media (max-width: 700px) {
          .clips-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {clips.length > 0 && (
        <div className="retention-banner">
          <strong>Limited-time availability:</strong> Video clips are automatically deleted
          after 30 days. You have{' '}
          <strong>
            {daysRemaining} day{daysRemaining === 1 ? '' : 's'}
          </strong>{' '}
          remaining to download the videos below.
        </div>
      )}

      <div className="session-layout">
        <div className="clips-column">
          <div className="clips-header">
            <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#16181b' }}>
              Available Clips
            </h2>
            <div className="clips-header-right">
              <div style={{ fontSize: '0.95rem', color: '#555', fontWeight: 600 }}>
                {clips.length} clip{clips.length === 1 ? '' : 's'}
              </div>
              {clips.length > 0 && (
                <button onClick={handleAddAll} className="add-all-button" type="button">
                  Add All to Cart
                </button>
              )}
            </div>
          </div>

          {clips.length === 0 ? (
            <div className="clip-card" style={{ color: '#555' }}>
              No clips are available for this session yet.
            </div>
          ) : (
            <div className="clips-grid">
              {clips.map((clip) => {
                const hdSelected =
                  cart.sessionBundle ||
                  clipHasProduct(cart, clip.id, 'full_game_hd');
                const baseDisabled = cart.sessionBundle;
                const inCart = isClipInCart(cart, clip.id);

                return (
                  <div key={clip.id} className="clip-card">
                    <SessionPreview slug={clip.slug} />

                    <div className="clip-meta-row">
                      <div>
                        <h3 className="clip-title">{formatClipLabel(clip)}</h3>
                        {clip.isFullGame ? (
                          <p style={{ margin: '6px 0 0', color: '#666', fontSize: '0.85rem' }}>
                            Full game recording
                          </p>
                        ) : null}
                      </div>
                      <div className="clip-price">{formatCents(clip.basePriceCents)}</div>
                    </div>

                    {!clip.isFullGame ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCart((current) => toggleShortClipInCart(current, clip.id))
                        }
                        disabled={cart.sessionBundle}
                        className={`clip-button ${inCart ? 'remove' : 'add'}`}
                        style={{
                          opacity: cart.sessionBundle ? 0.55 : 1,
                          cursor: cart.sessionBundle ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {cart.sessionBundle
                          ? 'Included in Session Bundle'
                          : inCart
                            ? 'Remove from Cart'
                            : 'Add to Cart'}
                      </button>
                    ) : (
                      <div className="product-options">
                        <label
                          className={`product-option ${baseDisabled ? 'disabled' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={hdSelected}
                            disabled={baseDisabled}
                            onChange={(event) =>
                              setCart((current) =>
                                toggleFullGameProduct(
                                  current,
                                  clip.id,
                                  'full_game_hd',
                                  event.target.checked
                                )
                              )
                            }
                          />
                          <span>
                            Purchase HD Video — {formatCents(clip.basePriceCents)}
                          </span>
                        </label>

                        {baseDisabled ? (
                          <div className="bundle-note">HD included in Session Bundle</div>
                        ) : null}

                        <label
                          className={`product-option ${!hdSelected ? 'disabled' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={clipHasProduct(cart, clip.id, 'pb_vision')}
                            disabled={!hdSelected}
                            onChange={(event) =>
                              setCart((current) =>
                                toggleFullGameProduct(
                                  current,
                                  clip.id,
                                  'pb_vision',
                                  event.target.checked
                                )
                              )
                            }
                          />
                          <span>
                            PB Vision Game Analysis — {formatCents(clip.pbVisionPriceCents)}
                          </span>
                        </label>

                        {SESSION_COACH_REVIEW_ADDON_ENABLED ? (
                          <label
                            className={`product-option ${!hdSelected ? 'disabled' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={clipHasProduct(cart, clip.id, 'coach_review')}
                              disabled={!hdSelected}
                              onChange={(event) =>
                                setCart((current) =>
                                  toggleFullGameProduct(
                                    current,
                                    clip.id,
                                    'coach_review',
                                    event.target.checked
                                  )
                                )
                              }
                            />
                            <span>
                              Pro Review — {formatCents(clip.coachReviewPriceCents)}
                            </span>
                          </label>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="cart-column">
          <div className="cart-card">
            <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '1.3rem' }}>
              Cart
            </h2>

            {bundleQuote.showBundle ? (
              <div className="bundle-offer">
                <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <input
                    type="checkbox"
                    checked={cart.sessionBundle}
                    onChange={(event) => handleBundleToggle(event.target.checked)}
                    style={{ marginTop: '4px' }}
                  />
                  <span>
                    <strong>Session Bundle</strong>
                    <div style={{ fontSize: '0.92rem', color: '#444', marginTop: '4px' }}>
                      {formatCents(bundleQuote.individualSumCents)} individually →{' '}
                      {formatCents(bundleQuote.bundlePriceCents)} bundle
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#198754', marginTop: '4px' }}>
                      Save {formatCents(bundleQuote.savingsCents)} (
                      {bundleQuote.billedHours} hr × {formatCents(bundleQuote.hourlyRateCents)}
                      /hr)
                    </div>
                  </span>
                </label>
              </div>
            ) : null}

            {!cartHasItems(cart) ? (
              <p style={{ marginTop: '12px', color: '#666' }}>Your cart is empty.</p>
            ) : (
              <>
                <ul className="cart-list">
                  {cartLineItems.map((item) => (
                    <li key={item} className="cart-list-item">
                      {item}
                    </li>
                  ))}
                </ul>

                <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '14px' }}>
                  <div style={{ marginBottom: '14px' }}>
                    <label
                      htmlFor="promo-code"
                      style={{
                        display: 'block',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        marginBottom: '6px',
                      }}
                    >
                      Promo Code
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        id="promo-code"
                        type="text"
                        placeholder="Enter code"
                        value={promoCode}
                        onChange={(event) => {
                          setPromoCode(event.target.value);
                          setPromoMessage(null);
                          setPromoDiscountCents(0);
                        }}
                        disabled={isCheckingOut}
                        style={{
                          flex: 1,
                          padding: '10px',
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleApplyPromo}
                        disabled={isCheckingOut || !promoCode.trim()}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '6px',
                          border: '1px solid #ddd',
                          background: '#fff',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Apply
                      </button>
                    </div>
                    {promoMessage ? (
                      <p
                        style={{
                          margin: '8px 0 0',
                          fontSize: '0.85rem',
                          color: promoDiscountCents > 0 ? '#198754' : '#b00020',
                        }}
                      >
                        {promoMessage}
                      </p>
                    ) : null}
                  </div>

                  {!isCartAllFree ? (
                    <div style={{ marginBottom: '14px' }}>
                      <label
                        htmlFor="checkout-email-paid"
                        style={{
                          display: 'block',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          marginBottom: '6px',
                        }}
                      >
                        Email Address (required)
                      </label>
                      <input
                        id="checkout-email-paid"
                        type="email"
                        placeholder="your@email.com"
                        value={checkoutEmail}
                        onChange={(event) => setCheckoutEmail(event.target.value)}
                        disabled={isCheckingOut}
                        required
                        autoComplete="email"
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  ) : null}

                  <p style={{ fontWeight: 800, fontSize: '1.05rem', margin: '0 0 16px' }}>
                    Total: {formatCents(Math.max(0, totalCents - promoDiscountCents))}
                    {promoDiscountCents > 0 ? (
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.85rem',
                          color: '#198754',
                          fontWeight: 600,
                        }}
                      >
                        Saved {formatCents(promoDiscountCents)}
                      </span>
                    ) : null}
                  </p>

                  {checkoutError ? (
                    <div
                      style={{
                        backgroundColor: '#ffebee',
                        color: '#c62828',
                        padding: '12px',
                        borderRadius: '8px',
                        marginBottom: '12px',
                        fontSize: '0.9rem',
                      }}
                    >
                      {checkoutError}
                    </div>
                  ) : null}

                  {isCartAllFree ? (
                    <div style={{ marginBottom: '14px' }}>
                      <label
                        htmlFor="checkout-email"
                        style={{
                          display: 'block',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          marginBottom: '6px',
                        }}
                      >
                        Email Address (required)
                      </label>
                      <input
                        id="checkout-email"
                        type="email"
                        placeholder="your@email.com"
                        value={checkoutEmail}
                        onChange={(event) => setCheckoutEmail(event.target.value)}
                        disabled={isCheckingOut}
                        required
                        autoComplete="email"
                        style={{
                          width: '100%',
                          padding: '10px',
                          border: '1px solid #ddd',
                          borderRadius: '6px',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  ) : null}

                  <div style={{ display: 'grid', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={handleCheckout}
                      disabled={isCheckingOut}
                      className="checkout-button"
                      style={{ opacity: isCheckingOut ? 0.6 : 1 }}
                    >
                      {isCheckingOut
                        ? 'Processing...'
                        : isCartAllFree
                          ? 'Complete Free Checkout'
                          : 'Checkout'}
                    </button>
                    <button
                      type="button"
                      onClick={clearCart}
                      disabled={isCheckingOut}
                      className="clear-button"
                    >
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
