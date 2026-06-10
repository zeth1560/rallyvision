import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveClipPrice } from '@/lib/pricing';
import { copyObjectWithinBucket } from '@/lib/s3';
import { buildPlayerTroveRedirectUrl } from '@/lib/player-trove-token';
import { sendPlayerTroveAccessEmail } from '@/lib/email';
import {
  buildFreeAccessExpiryFields,
  grantBaseProductEntitlementsForFreeAccess,
} from '@/lib/commerce/fulfillment';
import { logEntitlementGrant } from '@/lib/commerce/entitlements';
import { createYouTubeUploadJobForAccess } from '@/lib/youtube-upload-job';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email: rawEmail, clip_id: clipId } = body;

    if (!rawEmail || typeof rawEmail !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!clipId || typeof clipId !== 'string') {
      return NextResponse.json(
        { error: 'Clip ID is required' },
        { status: 400 }
      );
    }

    const email = rawEmail.toLowerCase().trim();

    console.log('Free claim requested', {
      email,
      clip_id: clipId,
    });

    console.log('Email normalized', {
      raw_email: rawEmail,
      normalized_email: email,
    });

    // Fetch clip to verify it exists, is published, and get pricing
    const { data: clip, error: clipError } = await supabaseAdmin
      .from('clips')
      .select(
        'id, title, slug, published, price_cents, club_id, court_id, created_at, s3_key, thumbnail_s3_key, duration_seconds, booking_id'
      )
      .eq('id', clipId)
      .single();

    if (clipError || !clip) {
      console.error('Clip lookup failed', {
        clip_id: clipId,
        error: clipError,
      });
      return NextResponse.json(
        { error: 'Clip not found' },
        { status: 404 }
      );
    }

    console.log('Clip lookup succeeded', {
      clip_id: clipId,
      published: clip.published,
      has_s3_key: !!clip.s3_key,
      price_cents: clip.price_cents,
    });

    if (!clip.published) {
      return NextResponse.json(
        { error: 'Clip is not published' },
        { status: 403 }
      );
    }

    // Resolve the clip price to check if it's free
    const pricing = await resolveClipPrice({
      clipId: clip.id,
      clubId: clip.club_id ?? null,
      courtId: clip.court_id ?? null,
      fallbackPriceCents: clip.price_cents ?? 0,
    });

    if (pricing.priceCents !== 0) {
      return NextResponse.json(
        { error: 'This clip is not free' },
        { status: 403 }
      );
    }

    console.log('Clip verified free', {
      clip_id: clipId,
      resolved_price_cents: pricing.priceCents,
    });

    // Enforce access window: clip.created_at + 30 days
    const clipCreatedAt = new Date(clip.created_at || new Date());
    const accessWindowExpires = new Date(
      clipCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000
    );
    const now = new Date();

    if (now > accessWindowExpires) {
      console.log('Free claim access window expired', {
        clip_id: clipId,
        clip_created_at: clip.created_at,
        access_window_expires: accessWindowExpires.toISOString(),
        now_utc: now.toISOString(),
      });
      return NextResponse.json(
        { error: 'This clip is no longer available to claim.' },
        { status: 410 }
      );
    }

    console.log('Access window validated', {
      clip_id: clipId,
      access_window_expires: accessWindowExpires.toISOString(),
    });

    const { data: existingAccess, error: existingError } = await supabaseAdmin
      .from('player_video_access')
      .select('id')
      .eq('email', email)
      .eq('clip_id', clipId)
      .eq('access_source', 'free_pilot')
      .maybeSingle();

    if (existingError) {
      console.error('Failed to check existing access:', existingError);
      return NextResponse.json(
        { error: 'Failed to verify access' },
        { status: 500 }
      );
    }

    let accessRecord;

    if (existingAccess) {
      console.log('Free claim access already exists', {
        access_id: existingAccess.id,
        email,
        clip_id: clipId,
      });
      accessRecord = existingAccess;
    } else {
      // Create new access record
      const now = new Date();
      const clipCreatedAt = new Date(clip.created_at || now);
      const purchaseWindowExpires = new Date(
        clipCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000
      );

      const purchasedAt = now.toISOString();
      const entitlementPatch = grantBaseProductEntitlementsForFreeAccess({
        clip: {
          id: clipId,
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
          clip_id: clipId,
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
        console.error('Failed to create player_video_access:', insertError);
        return NextResponse.json(
          { error: 'Failed to create access record' },
          { status: 500 }
        );
      }

      console.log('Access row created', {
        access_id: newAccess.id,
        email,
        clip_id: clipId,
      });
      logEntitlementGrant({
        phase: 'free_claim_access_created',
        access_id: newAccess.id,
        clip_id: clipId,
        email,
        entitlement_patch: entitlementPatch,
      });

      accessRecord = newAccess;
    }

    // Copy S3 file from originals to purchased/free-{access_id}/
    if (!clip.s3_key) {
      console.error('Clip missing source s3_key for free claim purchase copy:', {
        clip_id: clipId,
        access_id: accessRecord.id,
      });
      return NextResponse.json(
        { error: 'Clip file is not available for this copy' },
        { status: 400 }
      );
    }

    const originalFilename = clip.s3_key.split('/').pop() || `${clipId}.mp4`;
    const purchasedS3Key = `purchased/free-${accessRecord.id}/${originalFilename}`;

    console.log('S3 copy started', {
      access_id: accessRecord.id,
      source_key: clip.s3_key,
      destination_key: purchasedS3Key,
    });

    try {
      await copyObjectWithinBucket(clip.s3_key, purchasedS3Key);

      console.log('S3 copy completed', {
        access_id: accessRecord.id,
        source_key: clip.s3_key,
        destination_key: purchasedS3Key,
      });

      // Update the access record with purchased copy metadata
      const { error: updateError } = await supabaseAdmin
        .from('player_video_access')
        .update({
          purchased_s3_key: purchasedS3Key,
          purchased_copy_created_at: new Date().toISOString(),
        })
        .eq('id', accessRecord.id);

      if (updateError) {
        console.error('Failed to update purchased copy metadata:', {
          access_id: accessRecord.id,
          error: updateError,
        });
      } else {
        console.log('Purchased s3_key updated', {
          access_id: accessRecord.id,
          purchased_s3_key: purchasedS3Key,
        });

        try {
          const youtubeJobResult = await createYouTubeUploadJobForAccess({
            id: accessRecord.id,
            email,
            clip_id: clipId,
            purchased_s3_key: purchasedS3Key,
          });

          if (!youtubeJobResult.ok) {
            console.error('YouTube upload job creation failed', {
              access_id: accessRecord.id,
              clip_id: clipId,
              error: youtubeJobResult.error,
            });
          } else if (youtubeJobResult.created) {
            console.log('YouTube upload job created', {
              access_id: accessRecord.id,
              clip_id: clipId,
              job_id: youtubeJobResult.jobId,
            });
          }
        } catch (youtubeJobError) {
          console.error('YouTube upload job error', {
            access_id: accessRecord.id,
            clip_id: clipId,
            error:
              youtubeJobError instanceof Error
                ? youtubeJobError.message
                : youtubeJobError,
          });
        }
      }
    } catch (copyError) {
      console.error('S3 copy failed', {
        access_id: accessRecord.id,
        source_key: clip.s3_key,
        destination_key: purchasedS3Key,
        error: copyError,
      });
      // Do not fail the entire request, just log
    }


    try {
      await sendPlayerTroveAccessEmail(email, { source: 'free_claim' });
      console.log('Free claim confirmation email sent', { timestamp: new Date().toISOString() });
    } catch (emailError) {
      console.error('Free claim confirmation email failed', {
        error: emailError instanceof Error ? emailError.message : emailError,
      });
    }

    return NextResponse.json({
      success: true,
      access_id: accessRecord.id,
      message: 'Free access claimed successfully',
      redirect_url: buildPlayerTroveRedirectUrl(email),
    });
  } catch (error) {
    console.error('Free claim route error:', error);
    return NextResponse.json(
      { error: 'Failed to process free claim' },
      { status: 500 }
    );
  }
}
