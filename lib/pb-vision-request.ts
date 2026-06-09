import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  runPbVisionSubmissionAttempt,
  type PbVisionSubmissionAttemptResult,
} from '@/lib/pb-vision-retry-refund';

export type PbVisionRequestResult = PbVisionSubmissionAttemptResult;

const TERMINAL_STATUSES = new Set(['submitted', 'processing', 'completed']);

export async function submitPlayerTrovePbVisionRequest({
  accessId,
  viewerEmail,
  notes,
}: {
  accessId: string;
  viewerEmail: string;
  notes?: string | null;
}): Promise<PbVisionRequestResult> {
  const normalizedViewer = viewerEmail.toLowerCase().trim();

  const { data: access, error: accessError } = await supabaseAdmin
    .from('player_video_access')
    .select('id, clip_id, email')
    .eq('id', accessId)
    .single();

  if (accessError || !access) {
    return { ok: false, status: 404, error: 'Access record not found' };
  }

  const accessEmail = (access.email ?? '').toLowerCase().trim();

  if (accessEmail !== normalizedViewer) {
    return { ok: false, status: 403, error: 'You do not have access to this clip' };
  }

  const { data: existingRequest } = await supabaseAdmin
    .from('pb_vision_requests')
    .select('id, status, pbv_vid, pbv_webpage_url, refund_status')
    .eq('player_video_access_id', accessId)
    .maybeSingle();

  if (
    existingRequest &&
    TERMINAL_STATUSES.has(existingRequest.status) &&
    existingRequest.refund_status == null
  ) {
    return {
      ok: true,
      request_id: existingRequest.id,
      status: existingRequest.status,
      pbv_vid: existingRequest.pbv_vid,
      pbv_webpage_url: existingRequest.pbv_webpage_url,
    };
  }

  let requestId = existingRequest?.id as string | undefined;

  if (!requestId) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('pb_vision_requests')
      .insert({
        player_video_access_id: accessId,
        email: accessEmail,
        clip_id: access.clip_id,
        status: 'requested',
        notes: notes?.trim() || null,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      console.error('[PB Vision] Failed to create request record', {
        access_id: accessId,
        error: insertError?.message,
      });
      return { ok: false, status: 500, error: 'Failed to create PB Vision request' };
    }

    requestId = inserted.id as string;
  }

  return runPbVisionSubmissionAttempt({
    requestId,
    viewerEmail: normalizedViewer,
    notes,
    source: 'user',
  });
}
