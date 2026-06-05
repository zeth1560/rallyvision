-- PB Vision analysis requests linked to PlayerTrove access records
CREATE TABLE pb_vision_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_video_access_id uuid NOT NULL REFERENCES player_video_access(id) ON DELETE CASCADE,
  email text NOT NULL,
  clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested',
  source_s3_key text,
  pbv_vid text,
  pbv_webpage_url text,
  pbv_from_url text,
  pbv_ai_engine_version integer,
  error_reason text,
  notes text,
  submitted_at timestamptz,
  completed_at timestamptz,
  callback_received_at timestamptz,
  raw_callback jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pb_vision_requests_player_video_access_id_key UNIQUE (player_video_access_id)
);

CREATE INDEX idx_pb_vision_requests_email ON pb_vision_requests (lower(email));
CREATE INDEX idx_pb_vision_requests_status ON pb_vision_requests (status);
CREATE INDEX idx_pb_vision_requests_pbv_vid ON pb_vision_requests (pbv_vid);
CREATE INDEX idx_pb_vision_requests_created_at_desc ON pb_vision_requests (created_at DESC);

ALTER TABLE pb_vision_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON pb_vision_requests
FOR ALL USING (auth.role() = 'service_role');
