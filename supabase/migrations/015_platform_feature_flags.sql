-- Runtime toggles for customer-facing add-on features (no redeploy required)
CREATE TABLE platform_feature_flags (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_email text
);

ALTER TABLE platform_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON platform_feature_flags
FOR ALL USING (auth.role() = 'service_role');

INSERT INTO platform_feature_flags (key, label, description, enabled)
VALUES
  (
    'coach_review_customer',
    'Pro Review (PlayerTrove)',
    'Pro Review purchase, request flow, and upsell actions in PlayerTrove and success page.',
    true
  ),
  (
    'session_coach_review_addon',
    'Pro Review (session checkout)',
    'Pro Review add-on checkbox on session checkout pages.',
    true
  ),
  (
    'pb_vision_customer',
    'PB Vision',
    'PB Vision purchase and analysis upsell across PlayerTrove, success page, and session checkout.',
    true
  ),
  (
    'youtube_customer',
    'YouTube',
    'YouTube view buttons on PlayerTrove video cards.',
    false
  )
ON CONFLICT (key) DO NOTHING;
