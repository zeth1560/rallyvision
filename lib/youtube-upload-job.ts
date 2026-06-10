import { supabaseAdmin } from '@/lib/supabase-admin';

export type YouTubeUploadJobAccessRecord = {
  id: string;
  email: string;
  clip_id: string;
  purchased_s3_key: string | null;
};

export async function createYouTubeUploadJobForAccess(
  accessRecord: YouTubeUploadJobAccessRecord
): Promise<
  { ok: true; jobId: string; created: boolean } | { ok: false; error: string }
> {
  if (!accessRecord.id) {
    return { ok: false, error: 'Access record id is required' };
  }

  const sourceS3Key = accessRecord.purchased_s3_key?.trim();
  if (!sourceS3Key) {
    return { ok: false, error: 'purchased_s3_key is required' };
  }

  const email = accessRecord.email.trim().toLowerCase();
  const now = new Date().toISOString();

  const { data: existingJob, error: existingError } = await supabaseAdmin
    .from('youtube_upload_jobs')
    .select('id')
    .eq('player_video_access_id', accessRecord.id)
    .maybeSingle();

  if (existingError) {
    return {
      ok: false,
      error: `Failed to check existing YouTube upload job: ${existingError.message}`,
    };
  }

  if (existingJob) {
    return { ok: true, jobId: existingJob.id, created: false };
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('youtube_upload_jobs')
    .insert({
      player_video_access_id: accessRecord.id,
      email,
      clip_id: accessRecord.clip_id,
      source_s3_key: sourceS3Key,
      status: 'pending',
      updated_at: now,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    if (insertError?.code === '23505') {
      const { data: racedJob } = await supabaseAdmin
        .from('youtube_upload_jobs')
        .select('id')
        .eq('player_video_access_id', accessRecord.id)
        .maybeSingle();

      if (racedJob) {
        return { ok: true, jobId: racedJob.id, created: false };
      }
    }

    return {
      ok: false,
      error: insertError?.message ?? 'Failed to create YouTube upload job',
    };
  }

  const { error: statusError } = await supabaseAdmin
    .from('player_video_access')
    .update({
      youtube_status: 'pending',
      updated_at: now,
    })
    .eq('id', accessRecord.id);

  if (statusError) {
    console.error('[YouTube Upload Job] Failed to update youtube_status', {
      access_id: accessRecord.id,
      job_id: inserted.id,
      error: statusError.message,
    });
  }

  return { ok: true, jobId: inserted.id as string, created: true };
}
