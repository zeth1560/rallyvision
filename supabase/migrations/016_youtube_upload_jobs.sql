-- Async YouTube upload jobs for purchased player video access copies
CREATE TABLE youtube_upload_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_video_access_id uuid NOT NULL REFERENCES player_video_access(id) ON DELETE CASCADE,
  email text NOT NULL,
  clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  source_s3_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  youtube_video_id text,
  youtube_url text,
  error_reason text,
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT youtube_upload_jobs_player_video_access_id_key UNIQUE (player_video_access_id)
);

CREATE INDEX idx_youtube_upload_jobs_status ON youtube_upload_jobs (status);
CREATE INDEX idx_youtube_upload_jobs_clip_id ON youtube_upload_jobs (clip_id);
CREATE INDEX idx_youtube_upload_jobs_email ON youtube_upload_jobs (lower(email));
CREATE INDEX idx_youtube_upload_jobs_created_at_desc ON youtube_upload_jobs (created_at DESC);

ALTER TABLE youtube_upload_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON youtube_upload_jobs
FOR ALL USING (auth.role() = 'service_role');
