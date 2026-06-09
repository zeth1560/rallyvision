export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import SessionClipGrid from '@/app/components/SessionClipGrid';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import {
  resolveSessionBundleQuote,
  resolveSessionClipPricingList,
} from '@/lib/commerce/session-pricing';
import { calculateMinDaysRemaining } from '@/lib/calculateDaysRemaining';
import { getFeatureFlags } from '@/lib/feature-flags';

type ClipLookupRow = {
  recorded_at: string | null;
  club_id: string | null;
  court_id: string | null;
};

function formatDateLabel(dateValue: string) {
  return new Date(dateValue).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTimeRange(startTime: string | null, endTime: string | null, timeZone = 'America/Chicago') {
  if (!startTime || !endTime) return '';

  const start = new Date(startTime);
  const end = new Date(endTime);

  const startFormatted = start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });

  const endFormatted = end.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });

  return `${startFormatted} - ${endFormatted}`;
}

async function getClubName(clubId: string | null) {
  if (!clubId) return 'ReplayTrove';

  const { data: club } = await supabaseAdmin
    .from('clubs')
    .select('name')
    .eq('id', clubId)
    .maybeSingle();

  return club?.name || 'ReplayTrove';
}

async function getCourtName(courtId: string | null) {
  if (!courtId) return 'Court';

  const { data: court } = await supabaseAdmin
    .from('courts')
    .select('name')
    .eq('id', courtId)
    .maybeSingle();

  return court?.name || 'Court';
}

async function getBookingDisplayData(bookingid: string) {
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .select('booking_id, club_id, court_id, start_time, end_time, booking_date')
    .eq('booking_id', bookingid)
    .maybeSingle();

  let bookingDisplay = 'ReplayTrove Session';
  let subtitle = 'Browse your clips and check out once.';
  let clubName = 'ReplayTrove';

  let resolvedClubId: string | null = booking?.club_id ?? null;
  let resolvedCourtId: string | null = booking?.court_id ?? null;
  let resolvedDate: string | null =
    booking?.booking_date ?? booking?.start_time ?? null;

  if (!resolvedClubId || !resolvedCourtId || !resolvedDate) {
    const { data: fallbackClip } = await supabaseAdmin
      .from('clips')
      .select('recorded_at, club_id, court_id')
      .eq('booking_id', bookingid)
      .eq('published', true)
      .order('recorded_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle<ClipLookupRow>();

    if (fallbackClip) {
      resolvedClubId = resolvedClubId || fallbackClip.club_id;
      resolvedCourtId = resolvedCourtId || fallbackClip.court_id;
      resolvedDate = resolvedDate || fallbackClip.recorded_at;
    }
  }

  if (!bookingError || resolvedClubId || resolvedCourtId || resolvedDate) {
    clubName = await getClubName(resolvedClubId);
    const courtName = await getCourtName(resolvedCourtId);
    const dateLabel = resolvedDate ? formatDateLabel(resolvedDate) : 'Session';
    const timeRange = booking ? formatTimeRange(booking.start_time, booking.end_time) : '';

    let displayParts = [clubName, courtName, dateLabel];
    if (timeRange) {
      displayParts.push(timeRange);
    }

    bookingDisplay = displayParts.join(' | ');
    subtitle = 'Browse your clips, preview your favorites, and check out once.';
  }

  return {
    booking,
    bookingDisplay,
    subtitle,
    clubName,
    resolvedClubId,
    resolvedCourtId,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookingid: string }>;
}): Promise<Metadata> {
  const { bookingid } = await params;
  const { clubName } = await getBookingDisplayData(bookingid);

  return {
    title:
      clubName === 'ReplayTrove'
        ? 'ReplayTrove'
        : `ReplayTrove | ${clubName}`,
  };
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ bookingid: string }>;
}) {
  const { bookingid } = await params;

  const { data: clips, error: clipsError } = await supabaseAdmin
    .from('clips')
    .select(
      'id, slug, title, price_cents, recorded_at, club_id, court_id, created_at, duration_seconds'
    )
    .eq('booking_id', bookingid)
    .eq('published', true)
    .order('recorded_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  const { bookingDisplay, subtitle, booking, resolvedClubId, resolvedCourtId } =
    await getBookingDisplayData(bookingid);

  if (clipsError) {
    return (
      <ReplayTrovePageShell title={bookingDisplay} subtitle={subtitle}>
        <p>Could not load clips.</p>
      </ReplayTrovePageShell>
    );
  }

  const clipRows = clips ?? [];
  const clipPricing = await resolveSessionClipPricingList(clipRows);
  const bundleQuote = await resolveSessionBundleQuote({
    clips: clipRows,
    booking,
    clubId: resolvedClubId ?? clipRows[0]?.club_id ?? null,
    courtId: resolvedCourtId ?? clipRows[0]?.court_id ?? null,
  });

  const clipsForGrid = clipRows.map((clip) => {
    const pricing = clipPricing.find((row) => row.id === clip.id);

    return {
      id: clip.id,
      slug: clip.slug ?? '',
      title: clip.title ?? '',
      recorded_at: clip.recorded_at,
      created_at: clip.created_at,
      duration_seconds: clip.duration_seconds,
      basePriceCents: pricing?.basePriceCents ?? 0,
      pbVisionPriceCents: pricing?.pbVisionPriceCents ?? 0,
      coachReviewPriceCents: pricing?.coachReviewPriceCents ?? 0,
      isFullGame: pricing?.isFullGame ?? false,
      baseProduct: pricing?.baseProduct ?? 'clip_download',
    };
  });

  const daysRemaining = calculateMinDaysRemaining(clipRows);
  const featureFlags = await getFeatureFlags();

  return (
    <ReplayTrovePageShell title={bookingDisplay} subtitle={subtitle}>
      <SessionClipGrid
        clips={clipsForGrid}
        clipPricing={clipPricing}
        bundleQuote={bundleQuote}
        bookingId={bookingid}
        bookingDisplay={bookingDisplay}
        daysRemaining={daysRemaining}
        sessionCoachReviewAddonEnabled={featureFlags.session_coach_review_addon}
        pbVisionCustomerEnabled={featureFlags.pb_vision_customer}
      />
    </ReplayTrovePageShell>
  );
}
