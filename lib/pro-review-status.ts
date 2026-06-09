export const PRO_REVIEW_STATUSES = [
  'requested',
  'ready_for_reviewer',
  'in_review',
  'completed',
  'failed',
] as const;

export type ProReviewStatus = (typeof PRO_REVIEW_STATUSES)[number];

export const ADMIN_PRO_REVIEW_STATUS_OPTIONS = [
  'ready_for_reviewer',
  'in_review',
  'completed',
  'failed',
] as const;

export type AdminProReviewStatusOption =
  (typeof ADMIN_PRO_REVIEW_STATUS_OPTIONS)[number];

export function isProReviewStatus(value: string): value is ProReviewStatus {
  return PRO_REVIEW_STATUSES.includes(value as ProReviewStatus);
}

export function isAdminProReviewStatusOption(
  value: string
): value is AdminProReviewStatusOption {
  return ADMIN_PRO_REVIEW_STATUS_OPTIONS.includes(
    value as AdminProReviewStatusOption
  );
}
