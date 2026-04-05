import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import SessionPreview from '@/app/components/SessionPreview';
import DownloadAllButton from '@/app/components/DownloadAllButton';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { notFound } from 'next/navigation';

type SuccessPageProps = {
  searchParams: Promise<{
    session_id?: string;
  }>;
};

type OrderRow = {
  id: string;
  clip_id: string;
  stripe_checkout_session_id: string | null;
  amount_total: number | null;
  status: string | null;
};

type ClipRow = {
  id: string;
  slug: string | null;
  title: string | null;
  recorded_at: string | null;
};

function formatClipTime(recordedAt: string) {
  const date = new Date(recordedAt);

  if (Number.isNaN(date.getTime())) {
    return recordedAt;
  }

  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default async function SuccessPage({
  searchParams,
}: SuccessPageProps) {
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    notFound();
  }

  const { data: ordersData, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('id, clip_id, stripe_checkout_session_id, amount_total, status')
    .eq('stripe_checkout_session_id', sessionId)
    .eq('status', 'paid');

  if (ordersError) {
    return (
      <ReplayTrovePageShell
        title="Order Error"
        subtitle="We ran into a problem while loading your clips."
        maxWidth="1400px"
      >
        <div style={messageCard}>
          <p style={messageText}>We couldn’t load your order right now.</p>
        </div>
      </ReplayTrovePageShell>
    );
  }

  const orders = (ordersData ?? []) as OrderRow[];

  if (orders.length === 0) {
    return (
      <ReplayTrovePageShell
        title="Invalid Session"
        subtitle="We couldn’t find a completed order for that session."
        maxWidth="1400px"
      >
        <div style={messageCard}>
          <p style={messageText}>Invalid session_id.</p>
        </div>
      </ReplayTrovePageShell>
    );
  }

  const clipIds = [...new Set(orders.map((order) => order.clip_id))];

  const { data: clipsData, error: clipsError } = await supabaseAdmin
    .from('clips')
    .select('id, slug, title, recorded_at')
    .in('id', clipIds);

  if (clipsError) {
    return (
      <ReplayTrovePageShell
        title="Clip Error"
        subtitle="Your order was found, but the clips could not be loaded."
        maxWidth="1400px"
      >
        <div style={messageCard}>
          <p style={messageText}>
            We found your order, but could not load the clips.
          </p>
        </div>
      </ReplayTrovePageShell>
    );
  }

  const clips = (clipsData ?? []) as ClipRow[];

  const clipsById = new Map<string, ClipRow>();
  for (const clip of clips) {
    clipsById.set(clip.id, clip);
  }

  const orderedClips = clipIds
    .map((clipId) => clipsById.get(clipId))
    .filter((clip): clip is ClipRow => Boolean(clip));

  const totalPaidCents = orders.reduce(
    (sum, order) => sum + (order.amount_total ?? 0),
    0
  );

  const downloadAllHref =
    orderedClips.length > 1
      ? `/api/download-all?session_id=${encodeURIComponent(sessionId)}`
      : null;

  return (
    <ReplayTrovePageShell
      title="Your Clips Are Ready"
      subtitle="Preview and download your ReplayTrove clips below."
      maxWidth="1400px"
    >
      <div style={{ display: 'grid', gap: '20px' }}>
        <div style={summaryCard}>
          <div>
            <h2 style={summaryHeading}>Order Complete</h2>
            <p style={summaryText}>
              {totalPaidCents === 0
                ? 'Your clips were unlocked at no charge.'
                : `Payment complete. Total paid: $${(
                    totalPaidCents / 100
                  ).toFixed(2)}.`}
            </p>
          </div>

          {downloadAllHref ? <DownloadAllButton sessionId={sessionId} /> : null}
        </div>

        {orderedClips.length === 0 ? (
          <div style={messageCard}>
            <p style={messageText}>No clips were found for this order.</p>
          </div>
        ) : (
          <div style={grid}>
            {orderedClips.map((clip) => (
              <div key={clip.id} style={clipCard}>
                <div style={playerWrap}>
                  {clip.slug ? (
                    <SessionPreview slug={clip.slug} />
                  ) : (
                    <div style={missingPreview}>No preview available</div>
                  )}
                </div>

                <div style={clipInfo}>
                  <div style={filenameText}>
                    {clip.recorded_at
                      ? formatClipTime(clip.recorded_at)
                      : 'Replay Clip'}
                  </div>

                  <a
                    href={`/api/download/${clip.id}?session_id=${encodeURIComponent(
                      sessionId
                    )}`}
                    style={downloadButton}
                  >
                    Download Clip
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ReplayTrovePageShell>
  );
}

const summaryCard: React.CSSProperties = {
  border: '1px solid #dedede',
  borderRadius: '16px',
  padding: '24px',
  background: '#ffffff',
  boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '16px',
  flexWrap: 'wrap',
};

const summaryHeading: React.CSSProperties = {
  marginTop: 0,
  marginBottom: '8px',
  fontSize: '1.35rem',
  color: '#17191c',
};

const summaryText: React.CSSProperties = {
  margin: 0,
  color: '#555',
  lineHeight: 1.6,
};

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
  gap: '24px',
};

const clipCard: React.CSSProperties = {
  border: '1px solid #dedede',
  borderRadius: '16px',
  background: '#ffffff',
  boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
  overflow: 'hidden',
};

const playerWrap: React.CSSProperties = {
  padding: '16px 16px 0 16px',
};

const clipInfo: React.CSSProperties = {
  padding: '14px 16px 18px 16px',
  display: 'grid',
  gap: '12px',
};

const filenameText: React.CSSProperties = {
  color: '#17191c',
  fontWeight: 600,
  lineHeight: 1.4,
  wordBreak: 'break-word',
};

const downloadButton: React.CSSProperties = {
  display: 'inline-block',
  width: 'fit-content',
  padding: '10px 14px',
  borderRadius: '10px',
  background: '#111111',
  color: '#ffffff',
  textDecoration: 'none',
  fontWeight: 600,
};

const missingPreview: React.CSSProperties = {
  aspectRatio: '16 / 9',
  background: '#111',
  color: '#bbb',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '12px',
};

const messageCard: React.CSSProperties = {
  border: '1px solid #dedede',
  borderRadius: '16px',
  padding: '24px',
  background: '#ffffff',
  boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
};

const messageText: React.CSSProperties = {
  margin: 0,
  color: '#444',
};