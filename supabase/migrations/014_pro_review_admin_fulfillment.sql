-- Admin fulfillment tracking for Pro Review requests
ALTER TABLE pro_review_requests
ADD COLUMN assigned_at timestamptz,
ADD COLUMN failed_at timestamptz,
ADD COLUMN failure_reason text,
ADD COLUMN completed_email_sent_at timestamptz;

CREATE INDEX idx_pro_review_requests_assigned_at
  ON pro_review_requests (assigned_at)
  WHERE assigned_at IS NOT NULL;

CREATE INDEX idx_pro_review_requests_completed_email_sent_at
  ON pro_review_requests (completed_email_sent_at)
  WHERE completed_email_sent_at IS NOT NULL;
