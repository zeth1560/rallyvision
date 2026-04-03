import { supabaseAdmin } from '@/lib/supabase-admin';
import SessionClipGrid from '@/app/components/SessionClipGrid';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import { resolvePricesForClips } from '@/lib/pricing';

function getBookingDisplay(bookingId: string) {
  if (bookingId === 'test-booking-001') {
    return 'Rally Club | North Court | March 29, 2026 | 1pm to 3pm';
  }

  return 'Rally Club Session';
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ bookingid: string }>;
}) {
  const { bookingid } = await params;

  const { data: clips, error } = await supabaseAdmin
    .from('clips')
    .select('id, slug, title, price_cents, club_id, court_id')
    .eq('booking_id', bookingid)
    .eq('published', true)
    .order('created_at', { ascending: true });

  const bookingDisplay = getBookingDisplay(bookingid);

  if (error) {
    return (
      <ReplayTrovePageShell
        title={bookingDisplay}
        subtitle="Browse your clips, add your favorites, and check out once."
      >
        <p>Could not load clips.</p>
      </ReplayTrovePageShell>
    );
  }

  const resolvedClips = await resolvePricesForClips(clips || []);

  const clipsForGrid = resolvedClips.map((clip) => ({
    id: clip.id,
    slug: clip.slug,
    title: clip.title,
    price_cents: clip.resolved_price_cents,
  }));

  return (
    <ReplayTrovePageShell
      title={bookingDisplay}
      subtitle="Browse your clips, add your favorites, and check out once."
    >
      <SessionClipGrid
        clips={clipsForGrid}
        bookingId={bookingid}
        bookingDisplay={bookingDisplay}
      />
    </ReplayTrovePageShell>
  );
}