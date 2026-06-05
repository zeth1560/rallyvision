-- Commerce integrity: fulfillment idempotency, bundle amounts, promo dedupe.
-- orders keeps one row per clip per session; session-level idempotency lives in checkout_fulfillments.

CREATE TABLE checkout_fulfillments (
  stripe_checkout_session_id text PRIMARY KEY,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT checkout_fulfillments_status_check
    CHECK (status IN ('processing', 'completed', 'failed'))
);

CREATE INDEX idx_checkout_fulfillments_status
  ON checkout_fulfillments (status);

ALTER TABLE checkout_fulfillments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON checkout_fulfillments
FOR ALL USING (auth.role() = 'service_role');

-- Prevent duplicate clip orders for the same Stripe session on replay.
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_session_clip_unique
  ON orders (stripe_checkout_session_id, clip_id)
  WHERE stripe_checkout_session_id IS NOT NULL AND clip_id IS NOT NULL;

-- One promo redemption record per checkout session.
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_redemptions_session_unique
  ON promo_redemptions (stripe_checkout_session_id);

ALTER TABLE session_bundle_purchases
ADD COLUMN IF NOT EXISTS original_amount_cents integer,
ADD COLUMN IF NOT EXISTS final_amount_cents integer;

UPDATE session_bundle_purchases
SET
  original_amount_cents = amount_cents,
  final_amount_cents = amount_cents
WHERE original_amount_cents IS NULL;

COMMENT ON COLUMN session_bundle_purchases.original_amount_cents IS
  'Pre-promo bundle total in cents';
COMMENT ON COLUMN session_bundle_purchases.final_amount_cents IS
  'Post-promo bundle total in cents (may equal original when no promo applied)';
