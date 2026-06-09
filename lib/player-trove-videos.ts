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

type PlayerVideoAccessRow = {
  id: string;
  clip_id: string;
  purchased_at: string;
  clip_download_purchased_at: string | null;
  hd_download_purchased_at: string | null;
  pb_vision_purchased_at: string | null;
  coach_review_purchased_at: string | null;
  download_expires_at: string | null;
  pb_vision_expires_at: string | null;
  coach_review_expires_at: string | null;
  thumbnail_s3_key: string | null;
  youtube_url: string | null;
  youtube_status: string;
  clips: ClipRow | ClipRow[] | null;
};

type CanonicalAccessRecord = PlayerVideoAccessRow & {
  groupAccessIds: string[];
};

function mergeEntitlementFields(
  target: PlayerVideoAccessRow,
  source: PlayerVideoAccessRow,
  purchasedField: keyof Pick<
    PlayerVideoAccessRow,
    | 'clip_download_purchased_at'
    | 'hd_download_purchased_at'
    | 'pb_vision_purchased_at'
    | 'coach_review_purchased_at'
  >,
  expiresField: keyof Pick<
    PlayerVideoAccessRow,
    'download_expires_at' | 'pb_vision_expires_at' | 'coach_review_expires_at'
  >
) {
  const sourcePurchased = source[purchasedField];
  const targetPurchased = target[purchasedField];

  if (!sourcePurchased) {
    return;
  }

  if (
    !targetPurchased ||
    new Date(sourcePurchased).getTime() > new Date(targetPurchased).getTime()
  ) {
    target[purchasedField] = sourcePurchased;
    target[expiresField] = source[expiresField];
  }
}

function canonicalizeAccessRecords(
  records: PlayerVideoAccessRow[]
): CanonicalAccessRecord[] {
  const grouped = new Map<string, PlayerVideoAccessRow[]>();

  for (const record of records) {
    const group = grouped.get(record.clip_id) ?? [];
    group.push(record);
    grouped.set(record.clip_id, group);
  }

  const canonical: CanonicalAccessRecord[] = [];

  for (const group of grouped.values()) {
    const sorted = [...group].sort(
      (a, b) =>
        new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime()
    );

    if (sorted.length === 1) {
      canonical.push({
        ...sorted[0],
        groupAccessIds: [sorted[0].id],
      });
      continue;
    }

    const merged: PlayerVideoAccessRow = { ...sorted[0] };

    for (const record of sorted.slice(1)) {
      mergeEntitlementFields(
        merged,
        record,
        'hd_download_purchased_at',
        'download_expires_at'
      );
      mergeEntitlementFields(
        merged,
        record,
        'clip_download_purchased_at',
        'download_expires_at'
      );
      mergeEntitlementFields(
        merged,
        record,
        'pb_vision_purchased_at',
        'pb_vision_expires_at'
      );
      mergeEntitlementFields(
        merged,
        record,
        'coach_review_purchased_at',
        'coach_review_expires_at'
      );
    }

    const primaryId =
      sorted.find((record) => record.pb_vision_purchased_at)?.id ??
      sorted.find((record) => record.coach_review_purchased_at)?.id ??
      sorted.find(
        (record) => record.hd_download_purchased_at || record.clip_download_purchased_at
      )?.id ??
      sorted[0].id;

    const primaryRecord = sorted.find((record) => record.id === primaryId) ?? sorted[0];

    canonical.push({
      ...primaryRecord,
      ...merged,
      id: primaryId,
      groupAccessIds: sorted.map((record) => record.id),
    });
  }

  return canonical.sort(
    (a, b) =>
      new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime()
  );
}

function findLinkedRowForAccessIds<T>(
  accessIds: string[],
  rowsByAccessId: Map<string, T>
): T | null {
  for (const accessId of accessIds) {
    const row = rowsByAccessId.get(accessId);
    if (row) {
      return row;
    }
  }

  return null;
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

  const canonicalAccessRecords = canonicalizeAccessRecords(
    (accessRecords ?? []) as PlayerVideoAccessRow[]
  );

  const clipRows = canonicalAccessRecords
    .map((record) => normalizeClipRelation(record.clips as ClipRow | ClipRow[] | null))
    .filter(Boolean) as ClipRow[];

  const clubIds = [...new Set(clipRows.map((clip) => clip.club_id).filter(Boolean))] as string[];
  const courtIds = [...new Set(clipRows.map((clip) => clip.court_id).filter(Boolean))] as string[];

  const [clubNames, courtNames] = await Promise.all([
    fetchNameMap('clubs', clubIds),
    fetchNameMap('courts', courtIds),
  ]);

  const accessIds = canonicalAccessRecords.flatMap((record) => record.groupAccessIds);
  const pbVisionByAccessId = new Map<
    string,
    {
      id: string;
      status: string;
      pbv_webpage_url: string | null;
      error_reason: string | null;
      refund_status: string | null;
      submission_attempt_count: number;
    }
  >();

  const proReviewByAccessId = new Map<
    string,
    {
      id: string;
      status: string;
      reviewer_link: string | null;
      buyer_position: string | null;
      identification_frame_s3_key: string | null;
    }
  >();

  if (accessIds.length > 0) {
    const { data: pbVisionRows } = await supabaseAdmin
      .from('pb_vision_requests')
      .select(
        'id, player_video_access_id, status, pbv_webpage_url, error_reason, refund_status, submission_attempt_count'
      )
      .in('player_video_access_id', accessIds);

    for (const row of pbVisionRows ?? []) {
      pbVisionByAccessId.set(row.player_video_access_id, {
        id: row.id,
        status: row.status,
        pbv_webpage_url: row.pbv_webpage_url,
        error_reason: row.error_reason,
        refund_status: row.refund_status,
        submission_attempt_count: row.submission_attempt_count,
      });
    }

    const { data: proReviewRows } = await supabaseAdmin
      .from('pro_review_requests')
      .select(
        'id, player_video_access_id, status, reviewer_link, buyer_position, identification_frame_s3_key'
      )
      .in('player_video_access_id', accessIds);

    for (const row of proReviewRows ?? []) {
      proReviewByAccessId.set(row.player_video_access_id, {
        id: row.id,
        status: row.status,
        reviewer_link: row.reviewer_link,
        buyer_position: row.buyer_position,
        identification_frame_s3_key: row.identification_frame_s3_key,
      });
    }
  }

  const videos = await Promise.all(
    canonicalAccessRecords.map(async (record) => {
      const clipData = normalizeClipRelation(record.clips as ClipRow | ClipRow[] | null);
      const pbVision = findLinkedRowForAccessIds(
        record.groupAccessIds,
        pbVisionByAccessId
      );
      const proReview = findLinkedRowForAccessIds(
        record.groupAccessIds,
        proReviewByAccessId
      );

      const proReviewFrameUrl = proReview?.identification_frame_s3_key
        ? await createSignedObjectUrl(
            proReview.identification_frame_s3_key,
            getThumbnailContentType(proReview.identification_frame_s3_key)
          )
        : null;

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
          }, {
            pbVisionRequest: pbVision
              ? {
                  status: pbVision.status,
                  refund_status: pbVision.refund_status,
                }
              : null,
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
        pb_vision_refund_status: pbVision?.refund_status ?? null,
        pb_vision_submission_attempt_count: pbVision?.submission_attempt_count ?? 0,
        coach_review_expires_at: record.coach_review_expires_at,
        pro_review_request_id: proReview?.id ?? null,
        pro_review_status: proReview?.status ?? null,
        pro_review_reviewer_link: proReview?.reviewer_link ?? null,
        pro_review_buyer_position: proReview?.buyer_position ?? null,
        pro_review_identification_frame_s3_key:
          proReview?.identification_frame_s3_key ?? null,
        pro_review_identification_frame_url: proReviewFrameUrl,
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
