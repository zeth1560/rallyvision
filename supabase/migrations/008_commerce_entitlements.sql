-- Per-product purchase tracking on PlayerTrove access records
ALTER TABLE player_video_access
ADD COLUMN clip_download_purchased_at timestamptz,
ADD COLUMN hd_download_purchased_at timestamptz,
ADD COLUMN pb_vision_purchased_at timestamptz,
ADD COLUMN coach_review_purchased_at timestamptz,
ADD COLUMN granted_via_session_bundle boolean NOT NULL DEFAULT false;

-- Line-item fulfillment for Stripe checkouts
CREATE TABLE order_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  stripe_checkout_session_id text NOT NULL,
  clip_id uuid REFERENCES clips(id) ON DELETE SET NULL,
  booking_id text,
  product_type text NOT NULL,
  unit_amount_cents integer NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  promo_code_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_line_items_product_type_check
    CHECK (
      product_type IN (
        'clip_download',
        'full_game_hd',
        'pb_vision',
        'coach_review',
        'session_bundle'
      )
    )
);

CREATE INDEX idx_order_line_items_session
  ON order_line_items (stripe_checkout_session_id);

CREATE INDEX idx_order_line_items_order_id
  ON order_line_items (order_id);

CREATE INDEX idx_order_line_items_clip_product
  ON order_line_items (clip_id, product_type);

-- Session bundle ownership (one bundle purchase per customer per booking)
CREATE TABLE session_bundle_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text NOT NULL,
  email text NOT NULL,
  stripe_checkout_session_id text NOT NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  billed_hours integer NOT NULL,
  hourly_rate_cents integer NOT NULL,
  amount_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_session_bundle_purchases_email_booking
  ON session_bundle_purchases (lower(email), booking_id);

CREATE INDEX idx_session_bundle_purchases_booking
  ON session_bundle_purchases (booking_id);

ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_bundle_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON order_line_items
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role only" ON session_bundle_purchases
FOR ALL USING (auth.role() = 'service_role');

-- Grandfather existing access: map prior window grants to purchased-at timestamps
UPDATE player_video_access pva
SET clip_download_purchased_at = pva.purchased_at
FROM clips c
WHERE c.id = pva.clip_id
  AND pva.download_expires_at IS NOT NULL
  AND (
    c.duration_seconds IS NULL
    OR c.duration_seconds < 300
  );

UPDATE player_video_access pva
SET hd_download_purchased_at = pva.purchased_at
FROM clips c
WHERE c.id = pva.clip_id
  AND pva.download_expires_at IS NOT NULL
  AND c.duration_seconds IS NOT NULL
  AND c.duration_seconds >= 300;

UPDATE player_video_access
SET pb_vision_purchased_at = purchased_at
WHERE pb_vision_expires_at IS NOT NULL;

UPDATE player_video_access
SET coach_review_purchased_at = purchased_at
WHERE coach_review_expires_at IS NOT NULL;
