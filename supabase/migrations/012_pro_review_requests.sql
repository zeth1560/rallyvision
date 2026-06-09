-- Pro Review request workflow and pre-generated identification frames
CREATE TABLE pro_review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_video_access_id uuid NOT NULL REFERENCES player_video_access(id) ON DELETE CASCADE,
  email text NOT NULL,
  clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested',
  source_s3_key text,
  focus_notes text,
  skill_level text,
  specific_moment_notes text,
  additional_notes text,
  identification_frame_s3_key text,
  identification_frame_timestamp_seconds integer,
  buyer_position text,
  player_names jsonb,
  frame_rejected_count integer NOT NULL DEFAULT 0,
  rejected_frame_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewer_notes text,
  reviewer_link text,
  assigned_reviewer_email text,
  submitted_at timestamptz,
  ready_for_reviewer_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pro_review_requests_player_video_access_id_key UNIQUE (player_video_access_id)
);

CREATE INDEX idx_pro_review_requests_email ON pro_review_requests (lower(email));
CREATE INDEX idx_pro_review_requests_status ON pro_review_requests (status);
CREATE INDEX idx_pro_review_requests_clip_id ON pro_review_requests (clip_id);
CREATE INDEX idx_pro_review_requests_created_at_desc ON pro_review_requests (created_at DESC);

ALTER TABLE pro_review_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON pro_review_requests
FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE clip_identification_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  timestamp_seconds integer NOT NULL,
  frame_s3_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clip_identification_frames_clip_timestamp_key UNIQUE (clip_id, timestamp_seconds)
);

CREATE INDEX idx_clip_identification_frames_clip_id ON clip_identification_frames (clip_id);
CREATE INDEX idx_clip_identification_frames_created_at ON clip_identification_frames (created_at);

ALTER TABLE clip_identification_frames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON clip_identification_frames
FOR ALL USING (auth.role() = 'service_role');
