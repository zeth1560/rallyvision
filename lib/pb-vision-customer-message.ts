import { MAX_PB_VISION_SUBMISSION_ATTEMPTS } from '@/lib/player-trove-display';

export const PB_VISION_CUSTOMER_FAILURE_MESSAGE =
  'PB Vision analysis could not be completed. Please try again later.';

export function toCustomerFacingPbVisionError(error: string): string {
  const trimmed = error.trim();
  if (!trimmed) {
    return PB_VISION_CUSTOMER_FAILURE_MESSAGE;
  }

  if (
    trimmed.startsWith('Your PB Vision') ||
    trimmed.startsWith('You do not have access') ||
    trimmed.startsWith('PB Vision analysis has not been purchased') ||
    trimmed.startsWith('PB Vision analysis could not be completed') ||
    trimmed.startsWith('PB Vision analysis could not be delivered') ||
    trimmed.includes('refund has been issued') ||
    trimmed.startsWith('Failed to save PB Vision request') ||
    trimmed.startsWith('Failed to submit PB Vision')
  ) {
    return trimmed;
  }

  return PB_VISION_CUSTOMER_FAILURE_MESSAGE;
}

export function getPbVisionFailureNoticeForCustomer(
  pbVision:
    | {
        status: string | null;
        refund_status: string | null;
        submission_attempt_count: number;
      }
    | null
    | undefined
): string | null {
  if (!pbVision || pbVision.status !== 'failed') {
    return null;
  }

  if (
    pbVision.refund_status === 'completed' ||
    pbVision.refund_status === 'skipped_free' ||
    pbVision.submission_attempt_count >= MAX_PB_VISION_SUBMISSION_ATTEMPTS
  ) {
    return PB_VISION_CUSTOMER_FAILURE_MESSAGE;
  }

  return null;
}
