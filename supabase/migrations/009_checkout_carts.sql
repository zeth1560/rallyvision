-- Server-side checkout cart persistence (replaces large Stripe cartJson metadata)
CREATE TABLE checkout_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id text,
  session_bundle boolean NOT NULL DEFAULT false,
  cart_json jsonb NOT NULL,
  bundle_billed_hours integer,
  bundle_hourly_rate_cents integer,
  bundle_amount_cents integer,
  stripe_checkout_session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_checkout_carts_stripe_session
  ON checkout_carts (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

COMMENT ON TABLE checkout_carts IS
  'Normalized checkout cart snapshots referenced by Stripe metadata checkoutCartId';
