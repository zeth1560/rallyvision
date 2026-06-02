-- Add downloaded_at tracking field to player_video_access
-- This tracks when each user last downloaded their clip
ALTER TABLE player_video_access ADD COLUMN downloaded_at timestamptz;

-- Create index for querying download history
CREATE INDEX idx_player_video_access_downloaded_at 
  ON player_video_access(downloaded_at);
