import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveProductPrice } from '@/lib/pricing';
import { resolveBaseProductForClip } from '@/lib/commerce/products';
import { computeSessionDurationHours } from '@/lib/commerce/session-pricing';
import { copyObjectWithinBucket } from '@/lib/s3';
import { buildPlayerTroveRedirectUrl } from '@/lib/player-trove-token';
import { sendPlayerTroveAccessEmail } from '@/lib/email';
import {
  buildFreeAccessExpiryFields,
  grantBaseProductEntitlementsForFreeAccess,
} from '@/lib/commerce/fulfillment';
import { logEntitlementGrant } from '@/lib/commerce/entitlements';
import {
  PurchaseValidationError,
  validateFreeCheckoutEntitlements,
} from '@/lib/commerce/purchase-validation';

type ClipRow = {
  id: string;
  slug: string | null;
  title: string | null;
  published: boolean | null;
  price_cents: number | null;
  club_id: string | null;
  court_id: string | null;
  created_at: string | null;
  s3_key: string | null;
  thumbnail_s3_key: string | null;
  duration_seconds: number | null;
  booking_id: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // =========================================================================
    // INPUT VALIDATION
    // =========================================================================
    const rawEmail = typeof body?.email === 'string' ? body.email : '';
    const email = rawEmail.trim().toLowerCase();

    if (!email) {
      console.warn('[FREE_CHECKOUT] Email missing', {
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const clipIdsRaw = Array.isArray(body?.clip_ids) ? body.clip_ids : [];
    let clipIds = clipIdsRaw
      .filter((value: unknown): value is string => typeof value === 'string')
      .map((value: string) => value.trim())
      .filter((value: string) => value.length > 0);

    const sessionBundle = body?.session_bundle === true;
    const bookingId =
      typeof body?.booking_id === 'string' ? body.booking_id.trim() : '';

    if (sessionBundle) {
      if (!bookingId) {
        return NextResponse.json(
          { error: 'booking_id is required for session bundle checkout' },
          { status: 400 }
        );
      }

      const { data: sessionClips, error: sessionClipsError } = await supabaseAdmin
        .from('clips')
        .select('id')
        .eq('booking_id', bookingId)
        .eq('published', true);

      if (sessionClipsError) {
        return NextResponse.json(
          { error: 'Failed to load session clips' },
          { status: 500 }
        );
      }

      clipIds = (sessionClips ?? []).map((clip) => clip.id);

      if (clipIds.length === 0) {
        return NextResponse.json(
          { error: 'No published clips found for this session' },
          { status: 404 }
        );
      }
    }

    if (clipIds.length === 0) {
      console.warn('[FREE_CHECKOUT] No clip IDs provided', {
        email,
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: 'At least one clip ID is required' },
        { status: 400 }
      );
    }

    console.log('[FREE_CHECKOUT] Request started', {
      email,
      clip_ids_requested: clipIds,
      timestamp: new Date().toISOString(),
    });

    // =========================================================================
    // FETCH CLIPS
    // =========================================================================
    const { data: clipsData, error: clipsError } = await supabaseAdmin
      .from('clips')
      .select(
        'id, slug, title, published, price_cents, club_id, court_id, created_at, s3_key, thumbnail_s3_key, duration_seconds, booking_id'
      )
      .in('id', clipIds);

    if (clipsError) {
      console.error('[FREE_CHECKOUT] Clips query error', {
        email,
        clip_ids: clipIds,
        error: clipsError,
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: 'Failed to fetch clips' },
        { status: 500 }
      );
    }

    const clips = (clipsData ?? []) as ClipRow[];

    // Check if all requested clips were found
    const foundClipIds = new Set(clips.map((c) => c.id));
    const missingClipIds = clipIds.filter((id: string) => !foundClipIds.has(id));

    if (missingClipIds.length > 0) {
      console.warn('[FREE_CHECKOUT] Some clips not found', {
        email,
        clip_ids_requested: clipIds,
        missing_clip_ids: missingClipIds,
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        {
          error: 'One or more clips were not found',
          missing_clip_ids: missingClipIds,
        },
        { status: 404 }
      );
    }

    // =========================================================================
    // VALIDATE CLIPS: Published & Free
    // =========================================================================
    const unpublishedClips = clips.filter((c) => !c.published);
    if (unpublishedClips.length > 0) {
      console.warn('[FREE_CHECKOUT] Unpublished clips in request', {
        email,
        unpublished_clip_ids: unpublishedClips.map((c) => c.id),
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        {
          error: 'One or more clips are not published',
          unpublished_clip_ids: unpublishedClips.map((c) => c.id),
        },
        { status: 400 }
      );
    }

    // Resolve duration-aware base prices for all clips
    const resolvedClips = await Promise.all(
      clips.map(async (clip) => {
        const baseProduct = resolveBaseProductForClip(clip);
        const pricing = await resolveProductPrice({
          productType: baseProduct,
          clubId: clip.club_id,
          courtId: clip.court_id,
          fallbackPriceCents: clip.price_cents,
        });

        return {
          ...clip,
          resolved_price_cents: pricing.priceCents,
          resolved_pricing_mode: pricing.pricingMode,
          resolved_price_source: pricing.source,
          resolved_rule_id: pricing.ruleId,
          resolved_rule_name: pricing.ruleName,
          resolved_product_type: pricing.productType,
        };
      })
    );

    if (sessionBundle && bookingId) {
      const sampleClip = clips[0];
      const hourlyRate = await resolveProductPrice({
        productType: 'session_bundle',
        clubId: sampleClip?.club_id ?? null,
        courtId: sampleClip?.court_id ?? null,
      });

      const { data: bookingData } = await supabaseAdmin
        .from('bookings')
        .select('start_time, end_time')
        .eq('booking_id', bookingId)
        .maybeSingle();

      const billedHours = computeSessionDurationHours(bookingData ?? null, clips);
      const bundlePriceCents = billedHours * hourlyRate.priceCents;

      if (bundlePriceCents > 0) {
        return NextResponse.json(
          {
            error: 'Free checkout cannot process paid session bundles',
          },
          { status: 400 }
        );
      }
    }

    console.log('[FREE_CHECKOUT] Clips resolved', {
      email,
      clip_count: resolvedClips.length,
      resolved_prices: resolvedClips.map((c) => ({
        id: c.id,
        price_cents: c.resolved_price_cents,
        source: c.resolved_price_source,
      })),
      timestamp: new Date().toISOString(),
    });

    // Check if all clips are free (session bundles with $0 hourly rate cover paid individual bases)
    const paidClips = sessionBundle
      ? []
      : resolvedClips.filter((c) => (c.resolved_price_cents ?? 0) > 0);
    if (paidClips.length > 0) {
      console.warn('[FREE_CHECKOUT] Paid clips in request', {
        email,
        paid_clip_ids: paidClips.map((c) => c.id),
        paid_prices: paidClips.map((c) => ({
          id: c.id,
          price_cents: c.resolved_price_cents,
        })),
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        {
          error: 'Free checkout can only process free clips',
          paid_clip_ids: paidClips.map((c) => c.id),
        },
        { status: 400 }
      );
    }

    // =========================================================================
    // VALIDATE CLIPS: Within Access Window (30 days from creation)
    // =========================================================================
    const now = new Date();
    const expiredClips = clips.filter((c) => {
      const createdAt = new Date(c.created_at || new Date());
      const accessWindowExpires = new Date(
        createdAt.getTime() + 30 * 24 * 60 * 60 * 1000
      );
      return now > accessWindowExpires;
    });

    if (expiredClips.length > 0) {
      const expiredClipInfo = expiredClips.map((c) => ({
        id: c.id,
        slug: c.slug,
        created_at: c.created_at,
      }));
      console.warn('[FREE_CHECKOUT] Expired clips in request', {
        email,
        expired_clip_ids: expiredClips.map((c) => c.id),
        expired_clip_info: expiredClipInfo,
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        {
          error: 'One or more clips have expired and are no longer available for free checkout',
          expired_clip_ids: expiredClips.map((c) => c.id),
          expired_clip_info: expiredClipInfo,
        },
        { status: 410 }
      );
    }

    console.log('[FREE_CHECKOUT] Validation passed', {
      email,
      clip_ids: clipIds,
      timestamp: new Date().toISOString(),
    });

    await validateFreeCheckoutEntitlements({
      email,
      clips,
    });

    // =========================================================================
    // CREATE/REUSE ACCESS RECORDS
    // =========================================================================
    const accessRecords: Array<{
      id: string;
      clipId: string;
      isNew: boolean;
      needsCopy: boolean;
    }> = [];

    for (const clip of clips) {
      const { data: existingAccess, error: existingError } = await supabaseAdmin
        .from('player_video_access')
        .select('id, purchased_s3_key')
        .eq('email', email)
        .eq('clip_id', clip.id)
        .eq('access_source', 'free_pilot')
        .maybeSingle();

      if (existingError) {
        console.error('[FREE_CHECKOUT] Failed to check existing access', {
          email,
          clip_id: clip.id,
          error: existingError,
          timestamp: new Date().toISOString(),
        });
        return NextResponse.json(
          { error: 'Failed to verify access' },
          { status: 500 }
        );
      }

      if (existingAccess) {
        // Reuse existing access record
        const needsCopy = !existingAccess.purchased_s3_key;
        accessRecords.push({
          id: existingAccess.id,
          clipId: clip.id,
          isNew: false,
          needsCopy,
        });
        console.log('[FREE_CHECKOUT] Reusing existing access', {
          email,
          clip_id: clip.id,
          access_id: existingAccess.id,
          needs_copy: needsCopy,
          timestamp: new Date().toISOString(),
        });
      } else {
        // Create new access record
        const thirtyDaysFromNow = new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000
        );
        const clipCreatedAt = new Date(clip.created_at || now);
        const purchaseWindowExpires = new Date(
          clipCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000
        );
        const purchasedAt = now.toISOString();
        const entitlementPatch = grantBaseProductEntitlementsForFreeAccess({
          clip: {
            id: clip.id,
            booking_id: clip.booking_id ?? null,
            duration_seconds: clip.duration_seconds ?? null,
            club_id: clip.club_id ?? null,
            court_id: clip.court_id ?? null,
          },
          purchasedAt,
        });
        const expiryFields = buildFreeAccessExpiryFields(clip.created_at, purchasedAt);

        const { data: newAccess, error: insertError } = await supabaseAdmin
          .from('player_video_access')
          .insert({
            email,
            clip_id: clip.id,
            order_id: null,
            stripe_checkout_session_id: null,
            access_source: 'free_pilot',
            access_status: 'active',
            purchased_at: purchasedAt,
            purchase_window_expires_at: purchaseWindowExpires.toISOString(),
            download_expires_at: expiryFields.download_expires_at,
            thumbnail_s3_key: clip.thumbnail_s3_key ?? null,
            ...entitlementPatch,
          })
          .select('id')
          .single();

        if (insertError || !newAccess) {
          console.error('[FREE_CHECKOUT] Failed to create access record', {
            email,
            clip_id: clip.id,
            error: insertError,
            timestamp: new Date().toISOString(),
          });
          return NextResponse.json(
            { error: 'Failed to create access record' },
            { status: 500 }
          );
        }

        accessRecords.push({
          id: newAccess.id,
          clipId: clip.id,
          isNew: true,
          needsCopy: true,
        });
        console.log('[FREE_CHECKOUT] Created new access record', {
          email,
          clip_id: clip.id,
          access_id: newAccess.id,
          timestamp: new Date().toISOString(),
        });
        logEntitlementGrant({
          phase: 'free_checkout_access_created',
          access_id: newAccess.id,
          clip_id: clip.id,
          email,
          entitlement_patch: entitlementPatch,
        });
      }
    }

    // =========================================================================
    // COPY S3 FILES
    // =========================================================================
    const clipById = Object.fromEntries(clips.map((c) => [c.id, c]));

    for (const record of accessRecords) {
      if (!record.needsCopy) {
        console.log('[FREE_CHECKOUT] S3 copy skipped (already exists)', {
          access_id: record.id,
          clip_id: record.clipId,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      const clip = clipById[record.clipId];
      if (!clip.s3_key) {
        console.error('[FREE_CHECKOUT] Clip missing s3_key', {
          access_id: record.id,
          clip_id: record.clipId,
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      const originalFilename = clip.s3_key.split('/').pop() || `${clip.id}.mp4`;
      const purchasedS3Key = `purchased/free-${record.id}/${originalFilename}`;

      console.log('[FREE_CHECKOUT] S3 copy started', {
        access_id: record.id,
        clip_id: record.clipId,
        source_key: clip.s3_key,
        destination_key: purchasedS3Key,
        timestamp: new Date().toISOString(),
      });

      try {
        await copyObjectWithinBucket(clip.s3_key, purchasedS3Key);

        console.log('[FREE_CHECKOUT] S3 copy completed', {
          access_id: record.id,
          clip_id: record.clipId,
          destination_key: purchasedS3Key,
          timestamp: new Date().toISOString(),
        });

        // Update the access record with purchased copy metadata
        const { error: updateError } = await supabaseAdmin
          .from('player_video_access')
          .update({
            purchased_s3_key: purchasedS3Key,
            purchased_copy_created_at: new Date().toISOString(),
          })
          .eq('id', record.id);

        if (updateError) {
          console.error('[FREE_CHECKOUT] Failed to update purchased copy metadata', {
            access_id: record.id,
            clip_id: record.clipId,
            error: updateError,
            timestamp: new Date().toISOString(),
          });
        } else {
          console.log('[FREE_CHECKOUT] Updated purchased_s3_key', {
            access_id: record.id,
            clip_id: record.clipId,
            purchased_s3_key: purchasedS3Key,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (copyError) {
        console.error('[FREE_CHECKOUT] S3 copy failed', {
          access_id: record.id,
          clip_id: record.clipId,
          source_key: clip.s3_key,
          destination_key: purchasedS3Key,
          error: copyError,
          timestamp: new Date().toISOString(),
        });
        // Do not fail the entire request, just log
      }
    }

    // =========================================================================
    // SUCCESS - REDIRECT
    // =========================================================================
    const redirectUrl = buildPlayerTroveRedirectUrl(email);
    console.log('[FREE_CHECKOUT] Checkout complete, redirecting', {
      email,
      clip_ids: clipIds,
      access_records_created: accessRecords.filter((r) => r.isNew).length,
      access_records_reused: accessRecords.filter((r) => !r.isNew).length,
      redirect_destination: redirectUrl,
      timestamp: new Date().toISOString(),
    });

    try {
      await sendPlayerTroveAccessEmail(email, {
        source: 'free_checkout',
        clipCount: clipIds.length,
      });
      console.log('[FREE_CHECKOUT] Confirmation email sent', {
        clip_count: clipIds.length,
        timestamp: new Date().toISOString(),
      });
    } catch (emailError) {
      console.error('[FREE_CHECKOUT] Confirmation email failed', {
        error: emailError instanceof Error ? emailError.message : emailError,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      email,
      clip_ids: clipIds,
      access_records: accessRecords.map((r) => ({
        id: r.id,
        clip_id: r.clipId,
        isNew: r.isNew,
      })),
      redirect_url: redirectUrl,
    });
  } catch (error) {
    if (error instanceof PurchaseValidationError) {
      return NextResponse.json(
        { error: error.message, errorCode: error.code },
        { status: 400 }
      );
    }

    console.error('[FREE_CHECKOUT] Unexpected error', {
      error,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      { error: 'Failed to process free checkout' },
      { status: 500 }
    );
  }
}
