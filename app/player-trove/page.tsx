import { cookies } from 'next/headers';
import PlayerTroveContent from '@/app/player-trove/PlayerTroveContent';
import { retryPendingCheckoutFulfillmentsForEmail } from '@/lib/commerce/fulfillment-retry';
import { fetchPlayerTroveVideosForEmail } from '@/lib/player-trove-videos';
import {
  PLAYER_TROVE_TOKEN_COOKIE,
  resolvePlayerTroveViewerEmail,
} from '@/lib/player-trove-auth';

export const dynamic = 'force-dynamic';

type PlayerTrovePageProps = {
  searchParams: Promise<{
    token?: string;
    email?: string;
    purchased?: string;
    session_id?: string;
  }>;
};

export default async function PlayerTrovePage({ searchParams }: PlayerTrovePageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(PLAYER_TROVE_TOKEN_COOKIE)?.value;
  const serverNow = new Date().toISOString();

  const authParams = new URLSearchParams();
  if (params.token) {
    authParams.set('token', params.token);
  }
  if (params.email) {
    authParams.set('email', params.email);
  }

  const auth = resolvePlayerTroveViewerEmail(authParams, cookieToken);
  const hasUrlAuth = Boolean(params.token || params.email);

  let initialData = null;
  let initialShowAccessRequest = false;
  let initialError: string | null = null;

  if (auth.ok) {
    try {
      if (params.purchased === '1') {
        await retryPendingCheckoutFulfillmentsForEmail(auth.email, {
          sessionId: params.session_id ?? null,
        });
      }

      initialData = await fetchPlayerTroveVideosForEmail(auth.email);
    } catch {
      initialError = 'Failed to fetch access records';
    }
  } else if (!hasUrlAuth) {
    initialShowAccessRequest = true;
  } else {
    initialError = auth.error;
  }

  return (
    <PlayerTroveContent
      initialData={initialData}
      initialShowAccessRequest={initialShowAccessRequest}
      initialError={initialError}
      queryToken={params.token ?? null}
      email={params.email ?? null}
      purchased={params.purchased ?? null}
      checkoutSessionId={params.session_id ?? null}
      serverNow={serverNow}
    />
  );
}
