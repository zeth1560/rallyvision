import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { processPbVisionFailureAfterDeliveryError } from '@/lib/pb-vision-retry-refund';

type PbVisionCallback = {
  vid?: string;
  webpage?: string;
  from_url?: string;
  aiEngineVersion?: number;
  error?: { reason?: string };
  [key: string]: unknown;
};

// TODO: Verify webhook signature when PB Vision provides signing headers.

export async function POST(request: NextRequest) {
  let body: PbVisionCallback;

  try {
    body = (await request.json()) as PbVisionCallback;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const pbvVid = typeof body.vid === 'string' ? body.vid.trim() : '';
  if (!pbvVid) {
    console.warn('[PB Vision Webhook] Missing vid in callback');
    return NextResponse.json({ ok: true });
  }

  const now = new Date().toISOString();
  const hasError = Boolean(body.error?.reason);

  const updatePayload: Record<string, unknown> = {
    callback_received_at: now,
    raw_callback: body,
    updated_at: now,
  };

  if (hasError) {
    updatePayload.status = 'failed';
    updatePayload.error_reason = body.error?.reason ?? 'Unknown error';
  } else {
    updatePayload.status = 'completed';
    updatePayload.pbv_webpage_url =
      typeof body.webpage === 'string' ? body.webpage : null;
    updatePayload.pbv_from_url =
      typeof body.from_url === 'string' ? body.from_url : null;
    updatePayload.pbv_ai_engine_version =
      typeof body.aiEngineVersion === 'number' ? body.aiEngineVersion : null;
    updatePayload.completed_at = now;
    updatePayload.error_reason = null;
  }

  const { data, error } = await supabaseAdmin
    .from('pb_vision_requests')
    .update(updatePayload)
    .eq('pbv_vid', pbvVid)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[PB Vision Webhook] Database update failed', {
      pbv_vid: pbvVid,
      error: error.message,
    });
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  if (!data) {
    console.warn('[PB Vision Webhook] No matching request for vid', {
      pbv_vid: pbvVid,
    });
  } else {
    console.log('[PB Vision Webhook] Request updated', {
      request_id: data.id,
      pbv_vid: pbvVid,
      status: updatePayload.status,
    });

    if (hasError) {
      const requestId = data.id as string;
      const failureReason =
        typeof body.error?.reason === 'string'
          ? body.error.reason
          : 'Unknown error';

      after(async () => {
        try {
          await processPbVisionFailureAfterDeliveryError(requestId, failureReason);
        } catch (retryError) {
          console.error('[PB Vision Webhook] Auto-retry/refund failed', {
            request_id: requestId,
            error:
              retryError instanceof Error ? retryError.message : retryError,
          });
        }
      });
    }
  }

  return NextResponse.json({ ok: true });
}
