import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSignedDownloadUrl } from '@/lib/s3';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> }
) {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { clipId } = await params;

  const { data: clip, error } = await supabaseAdmin
    .from('clips')
    .select('id, club_id, s3_key, title')
    .eq('id', clipId)
    .single();

  if (error || !clip) {
    return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  }

  const isSuperAdmin = adminUser.role === 'super_admin';
  const isSameClub =
    adminUser.club_id &&
    clip.club_id &&
    adminUser.club_id === clip.club_id;

  if (!isSuperAdmin && !isSameClub) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!clip.s3_key) {
    return NextResponse.json(
      { error: 'Clip missing s3_key' },
      { status: 400 }
    );
  }

  try {
    const signedUrl = await createSignedDownloadUrl(clip.s3_key);
    return NextResponse.redirect(signedUrl, 302);
  } catch (err) {
    console.error('Download error:', err);

    return NextResponse.json(
      { error: 'Failed to generate download URL' },
      { status: 500 }
    );
  }
}