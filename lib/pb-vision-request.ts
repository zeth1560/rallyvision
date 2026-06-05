import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSignedMp4FetchUrl } from '@/lib/s3';
import { submitVideoUrlToPBVision, type PBVisionSubmitMetadata } from '@/lib/pbvision';
import { resolveHdDownloadByAccessId } from '@/lib/hd-download';
import { hasPbVisionPurchaseAccess } from '@/lib/commerce/entitlements';

const TERMINAL_STATUSES = new Set(['submitted', 'processing', 'completed']);

export type PbVisionRequestResult =
  | {
      ok: true;
      request_id: string;
      status: string;
      pbv_vid: string | null;
      pbv_webpage_url: string | null;
    }
  | { ok: false; status: number; error: string };

type ClipMetadata = {
  title: string | null;
  slug: string | null;
  recorded_at: string | null;
  created_at: string | null;
};

type AccessRow = {
  id: string;
  clip_id: string;
  email: string;
  access_status: string;
  pb_vision_purchased_at: string | null;
  pb_vision_expires_at: string | null;
};

function isPbVisionExpired(pbVisionExpiresAt: string | null) {
  if (!pbVisionExpiresAt) return true;
  return new Date() > new Date(pbVisionExpiresAt);
}

function epochSecondsFromIso(iso: string | null | undefined) {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  return Math.floor(ms / 1000);
}

async function fetchClipMetadata(clipId: string): Promise<ClipMetadata | null> {
  const { data, error } = await supabaseAdmin
    .from('clips')
    .select('title, slug, recorded_at, created_at')
    .eq('id', clipId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

async function fetchClubCourtNames(clipId: string) {
  const { data: clip } = await supabaseAdmin
    .from('clips')
    .select('club_id, court_id')
    .eq('id', clipId)
    .single();

  if (!clip?.club_id && !clip?.court_id) {
    return { facility: undefined, court: undefined };
  }

  const [clubResult, courtResult] = await Promise.all([
    clip.club_id
      ? supabaseAdmin.from('clubs').select('name').eq('id', clip.club_id).single()
      : Promise.resolve({ data: null }),
    clip.court_id
      ? supabaseAdmin.from('courts').select('name').eq('id', clip.court_id).single()
      : Promise.resolve({ data: null }),
  ]);

  return {
    facility: clubResult.data?.name ?? undefined,
    court: courtResult.data?.name ?? undefined,
  };
}

function buildPbVisionMetadata({
  email,
  accessId,
  requestId,
  clip,
  facility,
  court,
}: {
  email: string;
  accessId: string;
  requestId: string;
  clip: ClipMetadata;
  facility?: string;
  court?: string;
}): PBVisionSubmitMetadata {
  const gameStartEpoch =
    epochSecondsFromIso(clip.recorded_at) ??
    epochSecondsFromIso(clip.created_at);

  return {
    userEmails: [email],
    name: clip.title || clip.slug || undefined,
    gameStartEpoch,
    facility,
    court,
    desc: `ReplayTrove PlayerTrove access ${accessId} · request ${requestId}`,
  };
}

export async function submitPlayerTrovePbVisionRequest({
  accessId,
  viewerEmail,
  notes,
}: {
  accessId: string;
  viewerEmail: string;
  notes?: string | null;
}): Promise<PbVisionRequestResult> {
  const route = '/api/player-trove/pb-vision/request';
  const normalizedViewer = viewerEmail.toLowerCase().trim();

  const { data: access, error: accessError } = await supabaseAdmin
    .from('player_video_access')
    .select(
      'id, clip_id, email, access_status, pb_vision_purchased_at, pb_vision_expires_at'
    )
    .eq('id', accessId)
    .single();

  if (accessError || !access) {
    return { ok: false, status: 404, error: 'Access record not found' };
  }

  const accessRow = access as AccessRow;
  const accessEmail = (accessRow.email ?? '').toLowerCase().trim();

  if (accessEmail !== normalizedViewer) {
    return { ok: false, status: 403, error: 'You do not have access to this clip' };
  }

  if (accessRow.access_status !== 'active') {
    return { ok: false, status: 403, error: 'You do not have access to this clip' };
  }

  if (!hasPbVisionPurchaseAccess(accessRow)) {
    return {
      ok: false,
      status: 403,
      error: 'PB Vision analysis has not been purchased for this clip',
    };
  }

  if (isPbVisionExpired(accessRow.pb_vision_expires_at)) {
    return {
      ok: false,
      status: 403,
      error: 'Your PB Vision access has expired for this clip',
    };
  }

  const { data: existingRequest } = await supabaseAdmin
    .from('pb_vision_requests')
    .select('id, status, pbv_vid, pbv_webpage_url')
    .eq('player_video_access_id', accessId)
    .maybeSingle();

  if (existingRequest && TERMINAL_STATUSES.has(existingRequest.status)) {
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
        clip_id: accessRow.clip_id,
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
  } else if (notes?.trim()) {
    await supabaseAdmin
      .from('pb_vision_requests')
      .update({ notes: notes.trim(), updated_at: new Date().toISOString() })
      .eq('id', requestId);
  }

  const hdResolved = await resolveHdDownloadByAccessId(
    accessId,
    route,
    normalizedViewer
  );

  if (!hdResolved.ok) {
    return { ok: false, status: hdResolved.status, error: hdResolved.error };
  }

  const { s3Key } = hdResolved.download;

  if (!s3Key.toLowerCase().endsWith('.mp4')) {
    return {
      ok: false,
      status: 400,
      error: 'Video file must be an MP4 for PB Vision analysis',
    };
  }

  if (!requestId) {
    return { ok: false, status: 500, error: 'Failed to create PB Vision request' };
  }

  const clip = await fetchClipMetadata(accessRow.clip_id);
  if (!clip) {
    return { ok: false, status: 404, error: 'Clip not found' };
  }

  const { facility, court } = await fetchClubCourtNames(accessRow.clip_id);
  const metadata = buildPbVisionMetadata({
    email: accessEmail,
    accessId,
    requestId,
    clip,
    facility,
    court,
  });

  let signedUrl: string;
  try {
    signedUrl = await createSignedMp4FetchUrl(s3Key);
  } catch (signError) {
    console.error('[PB Vision] Signed URL generation failed', {
      access_id: accessId,
      request_id: requestId,
      s3_key: s3Key,
      error: signError instanceof Error ? signError.message : signError,
    });
    return { ok: false, status: 500, error: 'Failed to prepare video for PB Vision' };
  }

  let pbvVid: string;
  try {
    const submitted = await submitVideoUrlToPBVision({
      videoUrl: signedUrl,
      metadata,
    });
    pbvVid = submitted.vid;
  } catch (submitError) {
    const reason =
      submitError instanceof Error ? submitError.message : 'PB Vision submission failed';

    await supabaseAdmin
      .from('pb_vision_requests')
      .update({
        status: 'failed',
        error_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    console.error('[PB Vision] Submission failed', {
      access_id: accessId,
      request_id: requestId,
      s3_key: s3Key,
      error: reason,
    });

    return { ok: false, status: 502, error: reason };
  }

  const submittedAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from('pb_vision_requests')
    .update({
      status: 'submitted',
      source_s3_key: s3Key,
      pbv_vid: pbvVid,
      submitted_at: submittedAt,
      notes: notes?.trim() || null,
      error_reason: null,
      updated_at: submittedAt,
    })
    .eq('id', requestId);

  if (updateError) {
    console.error('[PB Vision] Failed to update request after submit', {
      access_id: accessId,
      request_id: requestId,
      pbv_vid: pbvVid,
      error: updateError.message,
    });
    return { ok: false, status: 500, error: 'Failed to save PB Vision request' };
  }

  console.log('[PB Vision] Video submitted', {
    access_id: accessId,
    request_id: requestId,
    clip_id: accessRow.clip_id,
    pbv_vid: pbvVid,
    key_source: hdResolved.download.keySource,
    s3_key: s3Key,
  });

  return {
    ok: true,
    request_id: requestId,
    status: 'submitted',
    pbv_vid: pbvVid,
    pbv_webpage_url: null,
  };
}
