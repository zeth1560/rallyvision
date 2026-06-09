import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendProReviewCompletedEmail } from '@/lib/email';
import { isProReviewStatus, type ProReviewStatus } from '@/lib/pro-review-status';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProReviewRequestAdminRow = {
  id: string;
  email: string;
  status: string;
  assigned_reviewer_email: string | null;
  reviewer_link: string | null;
  reviewer_notes: string | null;
  assigned_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  completed_email_sent_at: string | null;
  clips: { title: string | null; slug: string | null } | { title: string | null; slug: string | null }[] | null;
};

export type UpdateProReviewRequestInput = {
  requestId: string;
  assignedReviewerEmail?: string | null;
  reviewerLink?: string | null;
  reviewerNotes?: string | null;
  status: ProReviewStatus;
};

export type UpdateProReviewRequestResult =
  | {
      ok: true;
      request: {
        id: string;
        status: string;
        assigned_reviewer_email: string | null;
        reviewer_link: string | null;
        reviewer_notes: string | null;
        assigned_at: string | null;
        completed_at: string | null;
        failed_at: string | null;
        failure_reason: string | null;
        completed_email_sent_at: string | null;
      };
      completion_email_sent: boolean;
    }
  | { ok: false; status: number; error: string };

function normalizeOptionalEmail(value: unknown) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.toLowerCase();
}

function normalizeOptionalUrl(value: unknown) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeOptionalText(value: unknown) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function clipLabelFromRelation(
  clips: ProReviewRequestAdminRow['clips'],
  fallback: string
) {
  const clip = Array.isArray(clips) ? clips[0] : clips;
  if (!clip) {
    return fallback;
  }

  return clip.title || clip.slug || fallback;
}

export function parseUpdateProReviewRequestInput(
  body: unknown
):
  | { ok: true; input: UpdateProReviewRequestInput }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }

  const record = body as Record<string, unknown>;
  const requestId =
    typeof record.request_id === 'string' ? record.request_id.trim() : '';

  if (!requestId) {
    return { ok: false, error: 'request_id is required' };
  }

  const statusRaw =
    typeof record.status === 'string' ? record.status.trim() : '';

  if (!isProReviewStatus(statusRaw)) {
    return { ok: false, error: 'Invalid status' };
  }

  const assignedReviewerEmail = normalizeOptionalEmail(
    record.assigned_reviewer_email
  );

  if (assignedReviewerEmail && !EMAIL_REGEX.test(assignedReviewerEmail)) {
    return { ok: false, error: 'Invalid assigned reviewer email' };
  }

  const reviewerLink = normalizeOptionalUrl(record.reviewer_link);
  if (reviewerLink) {
    try {
      const parsed = new URL(reviewerLink);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, error: 'Reviewer link must be an http or https URL' };
      }
    } catch {
      return { ok: false, error: 'Invalid reviewer link URL' };
    }
  }

  return {
    ok: true,
    input: {
      requestId,
      assignedReviewerEmail,
      reviewerLink,
      reviewerNotes: normalizeOptionalText(record.reviewer_notes),
      status: statusRaw,
    },
  };
}

export async function updateProReviewRequestFromAdmin(
  input: UpdateProReviewRequestInput
): Promise<UpdateProReviewRequestResult> {
  const { data: existing, error: loadError } = await supabaseAdmin
    .from('pro_review_requests')
    .select(
      `
      id,
      email,
      status,
      assigned_reviewer_email,
      reviewer_link,
      reviewer_notes,
      assigned_at,
      completed_at,
      failed_at,
      failure_reason,
      completed_email_sent_at,
      clips (title, slug)
    `
    )
    .eq('id', input.requestId)
    .maybeSingle();

  if (loadError) {
    return { ok: false, status: 500, error: 'Failed to load Pro Review request' };
  }

  if (!existing) {
    return { ok: false, status: 404, error: 'Pro Review request not found' };
  }

  const request = existing as ProReviewRequestAdminRow;
  const now = new Date().toISOString();
  const statusChanged = request.status !== input.status;

  const patch: Record<string, unknown> = {
    assigned_reviewer_email: input.assignedReviewerEmail,
    reviewer_link: input.reviewerLink,
    reviewer_notes: input.reviewerNotes,
    status: input.status,
    updated_at: now,
  };

  if (
    input.status === 'in_review' &&
    input.assignedReviewerEmail &&
    !request.assigned_at
  ) {
    patch.assigned_at = now;
  }

  if (input.status === 'completed' && !request.completed_at) {
    patch.completed_at = now;
  }

  if (input.status === 'failed' && statusChanged && !request.failed_at) {
    patch.failed_at = now;
    if (input.reviewerNotes) {
      patch.failure_reason = input.reviewerNotes;
    }
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('pro_review_requests')
    .update(patch)
    .eq('id', input.requestId)
    .select(
      `
      id,
      status,
      assigned_reviewer_email,
      reviewer_link,
      reviewer_notes,
      assigned_at,
      completed_at,
      failed_at,
      failure_reason,
      completed_email_sent_at
    `
    )
    .single();

  if (updateError || !updated) {
    console.error('[Pro Review Admin] Failed to update request', {
      request_id: input.requestId,
      error: updateError?.message,
    });
    return { ok: false, status: 500, error: 'Failed to update Pro Review request' };
  }

  let completionEmailSent = false;

  const shouldSendCompletionEmail =
    statusChanged &&
    input.status === 'completed' &&
    Boolean(input.reviewerLink) &&
    !request.completed_email_sent_at;

  if (shouldSendCompletionEmail) {
    try {
      await sendProReviewCompletedEmail({
        to: request.email,
        clipLabel: clipLabelFromRelation(request.clips, 'your video'),
        reviewerLink: input.reviewerLink!,
      });

      const emailSentAt = new Date().toISOString();
      const { error: emailStampError } = await supabaseAdmin
        .from('pro_review_requests')
        .update({
          completed_email_sent_at: emailSentAt,
          updated_at: emailSentAt,
        })
        .eq('id', input.requestId);

      if (emailStampError) {
        console.error('[Pro Review Admin] Failed to stamp completion email', {
          request_id: input.requestId,
          error: emailStampError.message,
        });
      } else {
        updated.completed_email_sent_at = emailSentAt;
        completionEmailSent = true;
      }
    } catch (emailError) {
      console.error('[Pro Review Admin] Completion email failed', {
        request_id: input.requestId,
        email: request.email,
        error: emailError instanceof Error ? emailError.message : emailError,
      });
    }
  }

  return {
    ok: true,
    request: updated,
    completion_email_sent: completionEmailSent,
  };
}
