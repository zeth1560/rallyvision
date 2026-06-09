import type { Metadata } from 'next';
import { supabaseAdmin } from '@/lib/supabase-admin';
import SuccessPageClient from './SuccessPageClient';
import { getFeatureFlags } from '@/lib/feature-flags';

async function getClubNameForSession(sessionId: string | undefined) {
  if (!sessionId) return 'ReplayTrove';

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('clip_id')
    .eq('stripe_checkout_session_id', sessionId)
    .eq('status', 'paid');

  const clipIds = (orders || [])
    .map((order) => order.clip_id)
    .filter(Boolean);

  if (clipIds.length === 0) {
    return 'ReplayTrove';
  }

  const { data: clip } = await supabaseAdmin
    .from('clips')
    .select('club_id')
    .in('id', clipIds)
    .limit(1)
    .maybeSingle();

  if (!clip?.club_id) {
    return 'ReplayTrove';
  }

  const { data: club } = await supabaseAdmin
    .from('clubs')
    .select('name')
    .eq('id', clip.club_id)
    .maybeSingle();

  return club?.name || 'ReplayTrove';
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}): Promise<Metadata> {
  const { session_id } = await searchParams;
  const clubName = await getClubNameForSession(session_id);

  return {
    title:
      clubName === 'ReplayTrove'
        ? 'ReplayTrove'
        : `ReplayTrove | ${clubName}`,
  };
}

export default async function SuccessPage() {
  const featureFlags = await getFeatureFlags();

  return (
    <SuccessPageClient
      coachReviewCustomerEnabled={featureFlags.coach_review_customer}
      pbVisionCustomerEnabled={featureFlags.pb_vision_customer}
    />
  );
}