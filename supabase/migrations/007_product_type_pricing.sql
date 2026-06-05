-- Independent pricing by product type (clip, full-game HD, add-ons, session bundle hourly rate)
ALTER TABLE pricing_rules
ADD COLUMN product_type text NOT NULL DEFAULT 'clip_download';

ALTER TABLE pricing_rules
ADD CONSTRAINT pricing_rules_product_type_check
CHECK (
  product_type IN (
    'clip_download',
    'full_game_hd',
    'pb_vision',
    'coach_review',
    'session_bundle'
  )
);

CREATE INDEX idx_pricing_rules_product_type_lookup
  ON pricing_rules (product_type, rule_level, club_id, court_id)
  WHERE is_active = true;

COMMENT ON COLUMN pricing_rules.product_type IS
  'clip_download | full_game_hd | pb_vision | coach_review | session_bundle (hourly rate in fixed_price_cents)';
