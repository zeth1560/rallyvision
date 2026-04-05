import { supabaseAdmin } from '@/lib/supabase-admin';
import SessionClipGrid from '@/app/components/SessionClipGrid';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';

function formatTimeRange(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);

  const dateLabel = start.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const startTime = start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const endTime = end.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${dateLabel} | ${startTime} to ${endTime}`;
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ bookingid: string }>;
}) {
  const { bookingid } = await params;

  const { data: clips, error: clipsError } = await supabaseAdmin
    .from('clips')
    .select('id, slug, title, price_cents, recorded_at')
    .eq('booking_id', bookingid)
    .eq('published', true)
    .order('created_at', { ascending: true });

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .select('booking_id, club_id, court_id, start_time, end_time')
    .eq('booking_id', bookingid)
    .single();

  let bookingDisplay = `Booking ${bookingid}`;
  let subtitle = 'Browse your clips and check out once.';

  if (!bookingError && booking) {
    let clubName = 'ReplayTrove';
    let courtName = 'Court';

    if (booking.club_id) {
      const { data: club } = await supabaseAdmin
        .from('clubs')
        .select('name')
        .eq('id', booking.club_id)
        .single();

      if (club?.name) {
        clubName = club.name;
      }
    }

    if (booking.court_id) {
      const { data: court } = await supabaseAdmin
        .from('courts')
        .select('name')
        .eq('id', booking.court_id)
        .single();

      if (court?.name) {
        courtName = court.name;
      }
    }

    const timeRange =
      booking.start_time && booking.end_time
        ? formatTimeRange(booking.start_time, booking.end_time)
        : 'Session';

    bookingDisplay = `${clubName} | ${courtName} | ${timeRange}`;
    subtitle = 'Browse your clips, preview your favorites, and check out once.';
  }

  if (clipsError) {
    return (
      <ReplayTrovePageShell title={bookingDisplay} subtitle={subtitle}>
        <p>Could not load clips.</p>
      </ReplayTrovePageShell>
    );
  }

  return (
    <ReplayTrovePageShell title={bookingDisplay} subtitle={subtitle}>
      <SessionClipGrid
        clips={clips || []}
        bookingId={bookingid}
        bookingDisplay={bookingDisplay}
      />
    </ReplayTrovePageShell>
  );
}