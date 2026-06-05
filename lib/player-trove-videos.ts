import { supabaseAdmin } from '@/lib/supabase-admin';
import { createSignedObjectUrl } from '@/lib/s3';
import { resolveProductPrice } from '@/lib/pricing';
import { resolveBaseProductForClip } from '@/lib/commerce/products';
import { resolveUpsellOffers } from '@/lib/commerce/player-trove-upsell';

function getThumbnailContentType(key: string) {
  const lower = key.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return undefined;
}

type ClipRow = {
  id: string;
  slug: string | null;
  title: string | null;
  recorded_at: string | null;
  created_at: string | null;
  duration_seconds: number | null;
  booking_id: string | null;
  club_id: string | null;
  court_id: string | null;
  price_cents: number | null;
};

function normalizeClipRelation(
  clips: ClipRow | ClipRow[] | null | undefined
): ClipRow | null {
  if (!clips) return null;
  return Array.isArray(clips) ? clips[0] ?? null : clips;
}

async function fetchNameMap(table: 'clubs' | 'courts', ids: string[]) {
  if (ids.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .select('id, name')
    .in('id', ids);

  if (error || !data) {
    return new Map<string, string>();
  }

  return new Map(data.map((row) => [row.id, row.name]));
}

export async function fetchPlayerTroveVideosForEmail(email: string) {
  const normalizedEmail = email.toLowerCase().trim();

  const { data: accessRecords, error } = await supabaseAdmin
    .from('player_video_access')
    .select(`
      id,
      clip_id,
      purchased_at,
      clip_download_purchased_at,
      hd_download_purchased_at,
      pb_vision_purchased_at,
      coach_review_purchased_at,
      download_expires_at,
      pb_vision_expires_at,
      coach_review_expires_at,
      thumbnail_s3_key,
      youtube_url,
      youtube_status,
      clips (
        id,
        slug,
        title,
        recorded_at,
        created_at,
        duration_seconds,
        booking_id,
        club_id,
        court_id,
        price_cents
      )
    `)
    .eq('email', normalizedEmail)
    .eq('access_status', 'active')
    .order('purchased_at', { ascending: false });

  if (error) {
    throw error;
  }

  const clipRows = (accessRecords ?? [])
    .map((record) => normalizeClipRelation(record.clips as ClipRow | ClipRow[] | null))
    .filter(Boolean) as ClipRow[];

  const clubIds = [...new Set(clipRows.map((clip) => clip.club_id).filter(Boolean))] as string[];
  const courtIds = [...new Set(clipRows.map((clip) => clip.court_id).filter(Boolean))] as string[];

  const [clubNames, courtNames] = await Promise.all([
    fetchNameMap('clubs', clubIds),
    fetchNameMap('courts', courtIds),
  ]);

  const accessIds = (accessRecords ?? []).map((record) => record.id);
  const pbVisionByAccessId = new Map<
    string,
    {
      id: string;
      status: string;
      pbv_webpage_url: string | null;
      error_reason: string | null;
    }
  >();

  if (accessIds.length > 0) {
    const { data: pbVisionRows } = await supabaseAdmin
      .from('pb_vision_requests')
      .select('id, player_video_access_id, status, pbv_webpage_url, error_reason')
      .in('player_video_access_id', accessIds);

    for (const row of pbVisionRows ?? []) {
      pbVisionByAccessId.set(row.player_video_access_id, {
        id: row.id,
        status: row.status,
        pbv_webpage_url: row.pbv_webpage_url,
        error_reason: row.error_reason,
      });
    }
  }

  const videos = await Promise.all(
    (accessRecords ?? []).map(async (record) => {
      const clipData = normalizeClipRelation(record.clips as ClipRow | ClipRow[] | null);
      const pbVision = pbVisionByAccessId.get(record.id);

      const baseProduct = clipData
        ? resolveBaseProductForClip(clipData)
        : 'clip_download';

      const [basePrice, pbVisionPrice, coachReviewPrice] = clipData
        ? await Promise.all([
            resolveProductPrice({
              productType: baseProduct,
              clubId: clipData.club_id,
              courtId: clipData.court_id,
              fallbackPriceCents: clipData.price_cents,
            }),
            resolveProductPrice({
              productType: 'pb_vision',
              clubId: clipData.club_id,
              courtId: clipData.court_id,
            }),
            resolveProductPrice({
              productType: 'coach_review',
              clubId: clipData.club_id,
              courtId: clipData.court_id,
            }),
          ])
        : [
            { priceCents: 0 },
            { priceCents: 0 },
            { priceCents: 0 },
          ];

      const upsellOffers = clipData
        ? resolveUpsellOffers(record, clipData, {
            basePriceCents: basePrice.priceCents,
            pbVisionPriceCents: pbVisionPrice.priceCents,
            coachReviewPriceCents: coachReviewPrice.priceCents,
          })
        : [];

      return {
        access_id: record.id,
        clip_id: record.clip_id,
        clip_slug: clipData?.slug ?? null,
        clip_title: clipData?.title ?? null,
        recorded_at: clipData?.recorded_at ?? null,
        created_at: clipData?.created_at ?? null,
        duration_seconds: clipData?.duration_seconds ?? null,
        booking_id: clipData?.booking_id ?? null,
        club_name: clipData?.club_id ? clubNames.get(clipData.club_id) ?? null : null,
        court_name: clipData?.court_id ? courtNames.get(clipData.court_id) ?? null : null,
        thumbnail_url: record.thumbnail_s3_key
          ? await createSignedObjectUrl(
              record.thumbnail_s3_key,
              getThumbnailContentType(record.thumbnail_s3_key)
            )
          : null,
        youtube_url: record.youtube_url,
        youtube_status: record.youtube_status,
        download_expires_at: record.download_expires_at,
        pb_vision_expires_at: record.pb_vision_expires_at,
        pb_vision_request_id: pbVision?.id ?? null,
        pb_vision_status: pbVision?.status ?? null,
        pb_vision_webpage_url: pbVision?.pbv_webpage_url ?? null,
        pb_vision_error_reason: pbVision?.error_reason ?? null,
        coach_review_expires_at: record.coach_review_expires_at,
        purchased_at: record.purchased_at,
        upsell_offers: upsellOffers.map((offer) => ({
          product: offer.product,
          label: offer.label,
          price_cents: offer.priceCents,
          status: offer.status,
        })),
      };
    })
  );

  return {
    email: normalizedEmail,
    videos,
  };
}
