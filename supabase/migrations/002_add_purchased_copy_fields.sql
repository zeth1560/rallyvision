-- Add purchased copy metadata for player_video_access records
ALTER TABLE player_video_access
ADD COLUMN purchased_s3_key text,
ADD COLUMN purchased_copy_created_at timestamptz;

CREATE INDEX idx_player_video_access_purchased_s3_key ON player_video_access(purchased_s3_key);
