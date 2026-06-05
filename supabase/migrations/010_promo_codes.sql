-- Promo codes and redemption tracking
CREATE TABLE promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  description text,
  discount_type text NOT NULL,
  discount_value integer NOT NULL DEFAULT 0,
  scope_type text NOT NULL,
  product_type text,
  expires_at timestamptz,
  max_redemptions integer,
  once_per_email boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_discount_type_check
    CHECK (discount_type IN ('percentage', 'fixed_amount', 'free')),
  CONSTRAINT promo_codes_scope_type_check
    CHECK (scope_type IN ('product', 'cart')),
  CONSTRAINT promo_codes_product_type_check
    CHECK (
      product_type IS NULL
      OR product_type IN (
        'clip_download',
        'full_game_hd',
        'pb_vision',
        'coach_review',
        'session_bundle'
      )
    ),
  CONSTRAINT promo_codes_scope_product_consistency CHECK (
    (scope_type = 'cart' AND product_type IS NULL)
    OR (scope_type = 'product' AND product_type IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_promo_codes_code_lower ON promo_codes (lower(code));

CREATE TABLE promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  email text NOT NULL,
  stripe_checkout_session_id text NOT NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  discount_amount_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_promo_redemptions_promo_code_id
  ON promo_redemptions (promo_code_id);

CREATE INDEX idx_promo_redemptions_email_lower
  ON promo_redemptions (lower(email));

CREATE INDEX idx_promo_redemptions_stripe_session
  ON promo_redemptions (stripe_checkout_session_id);

ALTER TABLE order_line_items
ADD COLUMN original_unit_amount_cents integer;

COMMENT ON COLUMN order_line_items.unit_amount_cents IS
  'Final charged unit amount in cents after promo discounts';
COMMENT ON COLUMN order_line_items.original_unit_amount_cents IS
  'Pre-promo unit amount in cents';

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON promo_codes
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role only" ON promo_redemptions
FOR ALL USING (auth.role() = 'service_role');
