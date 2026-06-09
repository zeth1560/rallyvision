-- Track automatic PB Vision retries and refunds when delivery fails
ALTER TABLE pb_vision_requests
ADD COLUMN submission_attempt_count integer NOT NULL DEFAULT 0,
ADD COLUMN last_retry_at timestamptz,
ADD COLUMN refund_status text,
ADD COLUMN stripe_refund_id text,
ADD COLUMN refunded_at timestamptz,
ADD COLUMN auto_retry_exhausted_at timestamptz;

ALTER TABLE pb_vision_requests
ADD CONSTRAINT pb_vision_requests_refund_status_check
CHECK (
  refund_status IS NULL
  OR refund_status IN ('pending', 'completed', 'skipped_free', 'failed', 'not_applicable')
);

CREATE INDEX idx_pb_vision_requests_refund_status
  ON pb_vision_requests (refund_status)
  WHERE refund_status IS NOT NULL;
