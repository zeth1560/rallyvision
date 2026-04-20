import Link from 'next/link';
import { redirect } from 'next/navigation';
import SessionPreview from '@/app/components/SessionPreview';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { formatDateInTimezone } from '@/lib/formatDate';
import { supabaseAdmin } from '@/lib/supabase-admin';

type ClipRow = {
  id: string;
  title: string | null;
  slug: string | null;
  created_at: string | null;
  club_id: string | null;
  court_id: string | null;
  s3_key: string | null;
  preview_s3_key: string | null;
};

type ClubRow = {
  id: string;
  name: string | null;
};

type CourtRow = {
  id: string;
  club_id: string;
  name: string | null;
};

export default async function AdminClipsPage({
  searchParams,
}: {
  searchParams: Promise<{ club_id?: string; court_id?: string }>;
}) {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    redirect('/admin/login');
  }

  const { club_id: selectedClubId, court_id: selectedCourtId } = await searchParams;

  let clipsQuery = supabaseAdmin
    .from('clips')
    .select('id, title, slug, created_at, club_id, court_id, s3_key, preview_s3_key')
    .order('created_at', { ascending: false })
    .limit(100);

  if (adminUser.role !== 'super_admin' && adminUser.club_id) {
    clipsQuery = clipsQuery.eq('club_id', adminUser.club_id);
  }

  if (selectedClubId) {
    clipsQuery = clipsQuery.eq('club_id', selectedClubId);
  }

  if (selectedCourtId) {
    clipsQuery = clipsQuery.eq('court_id', selectedCourtId);
  }

  const [
    { data: clipsData, error: clipsError },
    { data: clubsData, error: clubsError },
    { data: courtsData, error: courtsError },
  ] = await Promise.all([
    clipsQuery,
    supabaseAdmin.from('clubs').select('id, name'),
    supabaseAdmin.from('courts').select('id, club_id, name'),
  ]);

  if (clipsError) {
    return (
      <ReplayTrovePageShell
        title="Admin Clips"
        subtitle="Browse and manage club clip downloads."
        maxWidth="1400px"
      >
        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '24px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
          }}
        >
          <p style={{ color: '#b00020', fontWeight: 700, marginTop: 0 }}>
            Failed to load clips.
          </p>
          <p style={{ marginBottom: 0, color: '#555' }}>{clipsError.message}</p>
        </div>
      </ReplayTrovePageShell>
    );
  }

  if (clubsError) {
    return (
      <ReplayTrovePageShell
        title="Admin Clips"
        subtitle="Browse and manage club clip downloads."
        maxWidth="1400px"
      >
        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '24px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
          }}
        >
          <p style={{ color: '#b00020', fontWeight: 700, marginTop: 0 }}>
            Failed to load clubs.
          </p>
          <p style={{ marginBottom: 0, color: '#555' }}>{clubsError.message}</p>
        </div>
      </ReplayTrovePageShell>
    );
  }

  if (courtsError) {
    return (
      <ReplayTrovePageShell
        title="Admin Clips"
        subtitle="Browse and manage club clip downloads."
        maxWidth="1400px"
      >
        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '24px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
          }}
        >
          <p style={{ color: '#b00020', fontWeight: 700, marginTop: 0 }}>
            Failed to load courts.
          </p>
          <p style={{ marginBottom: 0, color: '#555' }}>{courtsError.message}</p>
        </div>
      </ReplayTrovePageShell>
    );
  }

  const clipRows = (clipsData ?? []) as ClipRow[];
  const clubRows = (clubsData ?? []) as ClubRow[];
  const courtRows = (courtsData ?? []) as CourtRow[];

  const clubNameById = new Map<string, string>();
  for (const club of clubRows) {
    if (club.id) {
      clubNameById.set(club.id, club.name || 'Unknown Club');
    }
  }

  const courtById = new Map<string, CourtRow>();
  for (const court of courtRows) {
    courtById.set(court.id, court);
  }

  const selectedClubName = selectedClubId
    ? clubNameById.get(selectedClubId) || 'Unknown Club'
    : null;

  const selectedCourtName = selectedCourtId
    ? courtById.get(selectedCourtId)?.name || 'Unknown Court'
    : null;

  return (
    <ReplayTrovePageShell
      title="Admin Clips"
      subtitle="Browse, review, and download clips across your clubs."
      maxWidth="1400px"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '18px 22px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
          }}
        >
          <div style={{ fontSize: '0.95rem', color: '#555' }}>
            Logged in as <strong>{adminUser.email}</strong>
          </div>
          <div style={{ fontSize: '0.95rem', color: '#555', marginTop: '4px' }}>
            Role: <strong>{adminUser.role}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link
            href="/admin/dashboard"
            style={navButton}
          >
            Dashboard
          </Link>

          <Link
            href="/admin/clubs"
            style={navButton}
          >
            Clubs
          </Link>
        </div>
      </div>

      {(selectedClubName || selectedCourtName) && (
        <div
          style={{
            marginBottom: '20px',
            border: '1px solid #ececec',
            borderRadius: '14px',
            padding: '14px 16px',
            background: '#ffffff',
            boxShadow: '0 6px 20px rgba(0,0,0,0.05)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ color: '#444', fontSize: '0.95rem' }}>
            <strong>Filtered by:</strong>{' '}
            {selectedClubName ? selectedClubName : null}
            {selectedClubName && selectedCourtName ? ' • ' : null}
            {selectedCourtName ? selectedCourtName : null}
          </div>

          <Link
            href="/admin/clips"
            style={clearFilterButton}
          >
            Clear Filters
          </Link>
        </div>
      )}

      {clipRows.length === 0 ? (
        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '24px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, color: '#444' }}>No clips found.</p>
        </div>
      ) : (
        <>
          <div
            style={{
              marginBottom: '20px',
              color: '#555',
              fontSize: '0.95rem',
            }}
          >
            Showing {clipRows.length} clip{clipRows.length === 1 ? '' : 's'}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: '24px',
            }}
          >
            {clipRows.map((clip) => {
              const clubName = clip.club_id
                ? clubNameById.get(clip.club_id) || 'Unknown Club'
                : 'Unknown Club';

              const courtName = clip.court_id
                ? courtById.get(clip.court_id)?.name || 'Unknown Court'
                : 'Unknown Court';

              return (
                <div
                  key={clip.id}
                  style={{
                    border: '1px solid #dedede',
                    borderRadius: '16px',
                    background: '#ffffff',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '16px 16px 0 16px' }}>
                    {clip.slug ? (
                      <div
                        style={{
                          borderRadius: '12px',
                          overflow: 'hidden',
                          border: '1px solid #ececec',
                          background: '#f8f8f8',
                        }}
                      >
                        <SessionPreview slug={clip.slug} />
                      </div>
                    ) : (
                      <div
                        style={{
                          aspectRatio: '16 / 9',
                          background: '#111',
                          color: '#bbb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '12px',
                        }}
                      >
                        No preview available
                      </div>
                    )}
                  </div>

                  <div style={{ padding: '18px' }}>
                    <h2
                      style={{
                        margin: '0 0 10px',
                        fontSize: '1.1rem',
                        lineHeight: 1.35,
                        color: '#17191c',
                      }}
                    >
                      {clip.title || clip.slug || clip.id}
                    </h2>

                    <div
                      style={{
                        fontSize: '0.9rem',
                        color: '#666',
                        marginBottom: '18px',
                        lineHeight: 1.5,
                      }}
                    >
                      <div>
                        {clip.created_at
                          ? formatDateInTimezone(clip.created_at)
                          : '—'}
                      </div>
                      <div>{clubName}</div>
                      <div>{courtName}</div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: '10px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {clip.slug ? (
                        <Link
                          href={`/clip/${clip.slug}`}
                          style={secondaryButton}
                        >
                          View Public Page
                        </Link>
                      ) : null}

                      <a
                        href={`/api/admin/download/${clip.id}`}
                        style={primaryButton}
                      >
                        Download Clip
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </ReplayTrovePageShell>
  );
}

const navButton: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 16px',
  borderRadius: '10px',
  border: '1px solid #d0d0d0',
  background: '#ffffff',
  color: '#17191c',
  textDecoration: 'none',
  fontWeight: 600,
  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
};

const clearFilterButton: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 14px',
  borderRadius: '10px',
  border: '1px solid #d0d0d0',
  background: '#ffffff',
  color: '#17191c',
  textDecoration: 'none',
  fontWeight: 600,
};

const secondaryButton: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 14px',
  borderRadius: '10px',
  border: '1px solid #d0d0d0',
  background: '#ffffff',
  color: '#17191c',
  textDecoration: 'none',
  fontWeight: 600,
};

const primaryButton: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 14px',
  borderRadius: '10px',
  background: '#111111',
  color: '#ffffff',
  textDecoration: 'none',
  fontWeight: 600,
};