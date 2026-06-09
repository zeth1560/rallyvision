import Link from 'next/link';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import {
  canDownloadHd,
  formatClaimedDate,
  formatDownloadExpiry,
  getClipDateLine,
  getClipHeading,
  getClipLocationLine,
  getOffer,
  getUpsellStatusLabel,
  getUpsellStatusStyle,
  hasPurchasedBaseAccess,
  isFullGameClip,
  isShortClip,
  type PlayerTroveApiResponse,
  type PlayerTroveVideo,
} from '@/lib/player-trove-display';

type PlayerTroveServerViewProps = {
  data: PlayerTroveApiResponse;
  token?: string | null;
  serverNow: string;
};

function actionLinkStyle() {
  return {
    display: 'inline-block',
    padding: '10px 14px',
    borderRadius: '10px',
    background: '#111111',
    color: '#ffffff',
    fontWeight: 700,
    textDecoration: 'none',
    fontSize: '14px',
  } as const;
}

function secondaryLinkStyle() {
  return {
    display: 'inline-block',
    padding: '10px 14px',
    borderRadius: '10px',
    background: '#ffffff',
    color: '#111111',
    fontWeight: 700,
    textDecoration: 'none',
    fontSize: '14px',
    border: '1px solid #cfcfcf',
  } as const;
}

function ServerVideoCard({
  video,
  token,
  now,
}: {
  video: PlayerTroveVideo;
  token?: string | null;
  now: Date;
}) {
  const heading = getClipHeading(video);
  const locationLine = getClipLocationLine(video);
  const dateLine = getClipDateLine(video);
  const claimedDate = formatClaimedDate(video.purchased_at);
  const downloadExpiry = formatDownloadExpiry(video.download_expires_at);
  const downloadAllowed = canDownloadHd(video, now);
  const downloadParams = new URLSearchParams({
    access_id: video.access_id,
    redirect: '1',
  });
  if (token) {
    downloadParams.set('token', token);
  }
  const downloadHref = `/api/player-trove/download?${downloadParams.toString()}`;

  return (
    <div
      style={{
        border: '1px solid #dedede',
        borderRadius: '16px',
        padding: '18px',
        background: '#ffffff',
        boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '16 / 9',
          borderRadius: '10px',
          overflow: 'hidden',
          background: '#f0f0f0',
          marginBottom: '14px',
        }}
      >
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt={`Thumbnail for ${heading}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
      </div>

      <h3 style={{ margin: '0 0 8px', fontSize: '1.05rem' }}>{heading}</h3>
      {locationLine ? (
        <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>{locationLine}</p>
      ) : null}
      {dateLine ? (
        <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
          Session date: {dateLine}
        </p>
      ) : null}
      <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
        Claimed: {claimedDate}
      </p>
      {downloadExpiry ? (
        <p style={{ margin: '4px 0', color: '#666', fontSize: '14px' }}>
          HD download until {downloadExpiry}
        </p>
      ) : null}

      <div
        style={{
          marginTop: '12px',
          padding: '12px',
          borderRadius: '10px',
          background: '#f8f9fa',
          border: '1px solid #e9ecef',
        }}
      >
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: '#333' }}>
          Products
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '8px' }}>
          {video.upsell_offers.map((offer) => {
            const style = getUpsellStatusStyle(offer.status);
            return (
              <li
                key={offer.product}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>{offer.label}</div>
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: '999px',
                    ...style,
                  }}
                >
                  {getUpsellStatusLabel(offer.status)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div
        style={{
          marginTop: '16px',
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        {video.booking_id ? (
          <Link href={`/session/${video.booking_id}`} style={secondaryLinkStyle()}>
            View session
          </Link>
        ) : null}
        {video.clip_slug ? (
          <Link href={`/clip/${video.clip_slug}`} style={secondaryLinkStyle()}>
            Preview
          </Link>
        ) : null}
        {downloadAllowed ? (
          <a href={downloadHref} style={actionLinkStyle()}>
            Download HD
          </a>
        ) : hasPurchasedBaseAccess(video) ? (
          <span style={{ fontSize: '14px', color: '#666' }}>HD download expired</span>
        ) : null}
        {getOffer(video, 'pb_vision')?.status === 'purchased' &&
        video.pb_vision_webpage_url ? (
          <a
            href={video.pb_vision_webpage_url}
            target="_blank"
            rel="noreferrer"
            style={secondaryLinkStyle()}
          >
            View PB Vision Results
          </a>
        ) : null}
        {video.pro_review_status === 'completed' && video.pro_review_reviewer_link ? (
          <a
            href={video.pro_review_reviewer_link}
            target="_blank"
            rel="noreferrer"
            style={secondaryLinkStyle()}
          >
            View Pro Review
          </a>
        ) : null}
      </div>
    </div>
  );
}

function ServerVideoSection({
  title,
  description,
  videos,
  token,
  now,
}: {
  title: string;
  description: string;
  videos: PlayerTroveVideo[];
  token?: string | null;
  now: Date;
}) {
  if (videos.length === 0) {
    return null;
  }

  return (
    <section style={{ marginBottom: '36px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '1.35rem' }}>{title}</h2>
        <p style={{ margin: 0, color: '#666', fontSize: '15px' }}>{description}</p>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '18px',
        }}
      >
        {videos.map((video) => (
          <ServerVideoCard key={video.access_id} video={video} token={token} now={now} />
        ))}
      </div>
    </section>
  );
}

export default function PlayerTroveServerView({
  data,
  token,
  serverNow,
}: PlayerTroveServerViewProps) {
  const now = new Date(serverNow);
  const shortClips = data.videos.filter(isShortClip);
  const fullGameClips = data.videos.filter(isFullGameClip);

  return (
    <ReplayTrovePageShell
      title="PlayerTrove"
      subtitle={`Your videos for ${data.email}`}
    >
      {data.videos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          No videos found for this email.
        </div>
      ) : (
        <>
          <ServerVideoSection
            title={`Short Clips (${shortClips.length})`}
            description="Instant replays and highlights under 5 minutes."
            videos={shortClips}
            token={token}
            now={now}
          />
          <ServerVideoSection
            title={`Full Game Recordings (${fullGameClips.length})`}
            description="Complete game footage with coaching and analysis options."
            videos={fullGameClips}
            token={token}
            now={now}
          />
        </>
      )}
    </ReplayTrovePageShell>
  );
}
