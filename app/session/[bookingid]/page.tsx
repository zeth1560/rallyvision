import { supabaseAdmin } from '@/lib/supabase-admin';
import SessionClipGrid from '@/app/components/SessionClipGrid';
import RallyVisionPageShell from '@/app/components/RallyVisionPageShell';

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
    .select('id, slug, title, price_cents')
    .eq('booking_id', bookingid)
    .eq('published', true)
    .order('created_at', { ascending: true });

  const bookingDisplay = getBookingDisplay(bookingid);

  if (error) {
    return (
      <RallyVisionPageShell
        title={bookingDisplay}
        subtitle="Browse your clips, add your favorites, and check out once."
      >
        <p>Could not load clips.</p>
      </RallyVisionPageShell>
    );
  }

  return (
    <RallyVisionPageShell
      title={bookingDisplay}
      subtitle="Browse your clips, add your favorites, and check out once."
    >
      <SessionClipGrid
        clips={clips || []}
        bookingId={bookingid}
        bookingDisplay={bookingDisplay}
      />
    </RallyVisionPageShell>
  );
}