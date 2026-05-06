-- Add access_source field and update constraints for free claims vs Stripe purchases
ALTER TABLE player_video_access
ADD COLUMN access_source text NOT NULL DEFAULT 'stripe';

-- Drop the old unique constraint
ALTER TABLE player_video_access
DROP CONSTRAINT unique_email_clip_session;

-- Add new constraints for both Stripe and free-pilot flows
-- For Stripe purchases: (email, clip_id, stripe_checkout_session_id) must be unique when access_source = 'stripe'
CREATE UNIQUE INDEX idx_player_video_access_stripe_unique
  ON player_video_access (lower(email), clip_id, stripe_checkout_session_id)
  WHERE access_source = 'stripe' AND stripe_checkout_session_id IS NOT NULL;

-- For free-pilot claims: (email, clip_id) must be unique when access_source = 'free_pilot'
CREATE UNIQUE INDEX idx_player_video_access_free_unique
  ON player_video_access (lower(email), clip_id)
  WHERE access_source = 'free_pilot';
