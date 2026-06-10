import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  addPbVisionEditorEmail,
  syncPbVisionEditorEmails,
} from '@/lib/pbvision';

export type ShareableClipSubmission = {
  requestId: string;
  pbvVid: string;
  pbvWebpageUrl: string | null;
  status: 'submitted' | 'processing' | 'completed';
  sourceS3Key: string | null;
  submittedAt: string | null;
  completedAt: string | null;
};

const SHAREABLE_STATUSES = ['submitted', 'processing', 'completed'] as const;

export async function findShareableClipSubmission(
  clipId: string,
  excludeRequestId: string
): Promise<ShareableClipSubmission | null> {
  const { data, error } = await supabaseAdmin
    .from('pb_vision_requests')
    .select(
      'id, pbv_vid, pbv_webpage_url, status, source_s3_key, submitted_at, completed_at'
    )
    .eq('clip_id', clipId)
    .neq('id', excludeRequestId)
    .is('shared_from_request_id', null)
    .is('refund_status', null)
    .in('status', [...SHAREABLE_STATUSES])
    .not('pbv_vid', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[PB Vision] Failed to find shareable clip submission', {
      clip_id: clipId,
      exclude_request_id: excludeRequestId,
      error: error.message,
    });
    return null;
  }

  if (!data?.pbv_vid) {
    return null;
  }

  return {
    requestId: data.id,
    pbvVid: data.pbv_vid,
    pbvWebpageUrl: data.pbv_webpage_url,
    status: data.status as ShareableClipSubmission['status'],
    sourceS3Key: data.source_s3_key,
    submittedAt: data.submitted_at,
    completedAt: data.completed_at,
  };
}

export async function loadPbVisionPurchaserEmailsForVid(
  pbvVid: string
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('pb_vision_requests')
    .select('email')
    .eq('pbv_vid', pbvVid)
    .is('refund_status', null);

  if (error) {
    console.error('[PB Vision] Failed to load purchaser emails for vid', {
      pbv_vid: pbvVid,
      error: error.message,
    });
    return [];
  }

  const emails = new Set<string>();
  for (const row of data ?? []) {
    const email = (row.email ?? '').toLowerCase().trim();
    if (email) {
      emails.add(email);
    }
  }

  return [...emails];
}

export async function syncPbVisionEditorsForVid(pbvVid: string) {
  const emails = await loadPbVisionPurchaserEmailsForVid(pbvVid);
  if (emails.length === 0) {
    return;
  }

  try {
    await syncPbVisionEditorEmails(pbvVid, emails);
  } catch (error) {
    console.error('[PB Vision] Failed to sync editor access for shared vid', {
      pbv_vid: pbvVid,
      email_count: emails.length,
      error: error instanceof Error ? error.message : error,
    });
  }
}

export type PbVisionAttachAttemptResult = {
  ok: true;
  request_id: string;
  status: string;
  pbv_vid: string;
  pbv_webpage_url: string | null;
};

export async function tryAttachPbVisionRequestToExistingClipSubmission({
  requestId,
  clipId,
  purchaserEmail,
}: {
  requestId: string;
  clipId: string;
  purchaserEmail: string;
}): Promise<PbVisionAttachAttemptResult | null> {
  const existing = await findShareableClipSubmission(clipId, requestId);
  if (!existing) {
    return null;
  }

  const normalizedEmail = purchaserEmail.toLowerCase().trim();

  try {
    await addPbVisionEditorEmail(existing.pbvVid, normalizedEmail);
  } catch (error) {
    console.error('[PB Vision] Failed to grant editor access for shared submission', {
      request_id: requestId,
      primary_request_id: existing.requestId,
      pbv_vid: existing.pbvVid,
      email: normalizedEmail,
      error: error instanceof Error ? error.message : error,
    });
  }

  const now = new Date().toISOString();
  const isCompleted = existing.status === 'completed';

  const { error: updateError } = await supabaseAdmin
    .from('pb_vision_requests')
    .update({
      status: isCompleted ? 'completed' : 'submitted',
      pbv_vid: existing.pbvVid,
      pbv_webpage_url: existing.pbvWebpageUrl,
      source_s3_key: existing.sourceS3Key,
      shared_from_request_id: existing.requestId,
      submitted_at: existing.submittedAt ?? now,
      completed_at: isCompleted ? existing.completedAt ?? now : null,
      error_reason: null,
      updated_at: now,
    })
    .eq('id', requestId);

  if (updateError) {
    console.error('[PB Vision] Failed to attach request to shared clip submission', {
      request_id: requestId,
      primary_request_id: existing.requestId,
      error: updateError.message,
    });
    return null;
  }

  console.log('[PB Vision] Attached request to existing clip submission', {
    request_id: requestId,
    primary_request_id: existing.requestId,
    clip_id: clipId,
    pbv_vid: existing.pbvVid,
    status: isCompleted ? 'completed' : 'submitted',
    email: normalizedEmail,
  });

  return {
    ok: true,
    request_id: requestId,
    status: isCompleted ? 'completed' : 'submitted',
    pbv_vid: existing.pbvVid,
    pbv_webpage_url: existing.pbvWebpageUrl,
  };
}

export async function updateSharedRequestsForPrimaryVid({
  primaryRequestId,
  pbvVid,
  status,
  pbvWebpageUrl,
  sourceS3Key,
  submittedAt,
}: {
  primaryRequestId: string;
  pbvVid: string;
  status: 'submitted' | 'processing' | 'completed' | 'failed';
  pbvWebpageUrl?: string | null;
  sourceS3Key?: string | null;
  submittedAt?: string | null;
}) {
  const updatePayload: Record<string, unknown> = {
    pbv_vid: pbvVid,
    status,
    updated_at: new Date().toISOString(),
  };

  if (pbvWebpageUrl !== undefined) {
    updatePayload.pbv_webpage_url = pbvWebpageUrl;
  }
  if (sourceS3Key !== undefined) {
    updatePayload.source_s3_key = sourceS3Key;
  }
  if (submittedAt !== undefined) {
    updatePayload.submitted_at = submittedAt;
  }
  if (status === 'completed') {
    updatePayload.completed_at = new Date().toISOString();
    updatePayload.error_reason = null;
  }
  if (status === 'failed') {
    updatePayload.error_reason = updatePayload.error_reason ?? null;
  }

  const { error } = await supabaseAdmin
    .from('pb_vision_requests')
    .update(updatePayload)
    .eq('shared_from_request_id', primaryRequestId)
    .is('refund_status', null);

  if (error) {
    console.error('[PB Vision] Failed to update shared requests for primary vid', {
      primary_request_id: primaryRequestId,
      pbv_vid: pbvVid,
      error: error.message,
    });
  }
}

export async function loadSharedPbVisionRequestIds(
  primaryRequestId: string
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('pb_vision_requests')
    .select('id')
    .eq('shared_from_request_id', primaryRequestId)
    .is('refund_status', null);

  if (error) {
    console.error('[PB Vision] Failed to load shared request ids', {
      primary_request_id: primaryRequestId,
      error: error.message,
    });
    return [];
  }

  return (data ?? []).map((row) => row.id as string);
}
