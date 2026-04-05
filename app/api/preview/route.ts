import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSignedDownloadUrl } from '@/lib/s3';

const slugRegex = /^[a-zA-Z0-9_-]+$/;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');

    if (!slug) {
      return NextResponse.json(
        { error: 'Missing slug' },
        { status: 400 }
      );
    }

    if (!slugRegex.test(slug)) {
      return NextResponse.json(
        { error: 'Invalid slug' },
        { status: 400 }
      );
    }

    const { data: clip, error: clipError } = await supabaseAdmin
      .from('clips')
      .select('id, slug, title, published, preview_s3_key')
      .eq('slug', slug)
      .eq('published', true)
      .single();

    if (clipError || !clip) {
      return NextResponse.json(
        { error: 'Preview not found' },
        { status: 404 }
      );
    }

    if (!clip.preview_s3_key) {
      return NextResponse.json(
        { error: 'Preview unavailable' },
        { status: 404 }
      );
    }

    const previewUrl = await createSignedDownloadUrl(clip.preview_s3_key);

    return NextResponse.json({
      previewUrl,
      clipTitle: clip.title,
    });
  } catch (error) {
    console.error('Preview route error:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Something went wrong',
      },
      { status: 500 }
    );
  }
}