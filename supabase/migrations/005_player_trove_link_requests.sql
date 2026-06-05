-- Rate-limit log for PlayerTrove magic-link requests
CREATE TABLE player_trove_link_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_player_trove_link_requests_email_created_at
  ON player_trove_link_requests (lower(email), created_at DESC);

CREATE INDEX idx_player_trove_link_requests_ip_created_at
  ON player_trove_link_requests (ip_address, created_at DESC);

ALTER TABLE player_trove_link_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON player_trove_link_requests
FOR ALL USING (auth.role() = 'service_role');
