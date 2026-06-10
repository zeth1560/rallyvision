-- Share one PB Vision analysis per clip across multiple purchaser requests
ALTER TABLE pb_vision_requests
ADD COLUMN shared_from_request_id uuid REFERENCES pb_vision_requests(id) ON DELETE SET NULL;

CREATE INDEX idx_pb_vision_requests_shared_from
  ON pb_vision_requests (shared_from_request_id)
  WHERE shared_from_request_id IS NOT NULL;

CREATE INDEX idx_pb_vision_requests_clip_primary_active
  ON pb_vision_requests (clip_id, created_at)
  WHERE shared_from_request_id IS NULL
    AND refund_status IS NULL
    AND pbv_vid IS NOT NULL;
