-- Create player_video_access table for PlayerTrove
CREATE TABLE player_video_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  stripe_checkout_session_id text,
  access_status text NOT NULL DEFAULT 'active',
  purchased_at timestamptz NOT NULL DEFAULT now(),
  purchase_window_expires_at timestamptz,
  download_expires_at timestamptz,
  pb_vision_expires_at timestamptz,
  coach_review_expires_at timestamptz,
  youtube_url text,
  youtube_status text NOT NULL DEFAULT 'not_started',
  thumbnail_s3_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint to prevent duplicates
ALTER TABLE player_video_access
ADD CONSTRAINT unique_email_clip_session
UNIQUE (email, clip_id, stripe_checkout_session_id);

-- Indexes for performance
CREATE INDEX idx_player_video_access_email ON player_video_access(email);
CREATE INDEX idx_player_video_access_clip_id ON player_video_access(clip_id);
CREATE INDEX idx_player_video_access_order_id ON player_video_access(order_id);
CREATE INDEX idx_player_video_access_stripe_session ON player_video_access(stripe_checkout_session_id);

-- RLS: Service role only for now
ALTER TABLE player_video_access ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can access (no anon access)
CREATE POLICY "Service role only" ON player_video_access
FOR ALL USING (auth.role() = 'service_role');

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_player_video_access_updated_at
    BEFORE UPDATE ON player_video_access
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();