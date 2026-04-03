import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import { supabaseAdmin } from '@/lib/supabase-admin';
import AddCourtForm from './AddCourtForm';
import { createClubAction, createCourtAction } from './server-actions';

type ClubRow = {
  id: string;
  name: string | null;
  created_at?: string | null;
};

type CourtRow = {
  id: string;
  name: string | null;
  club_id: string;
  created_at?: string | null;
};

type ClipRow = {
  id: string;
  court_id: string | null;
};

export default async function ClubsPage() {
  const [{ data: clubs }, { data: courts }, { data: clips }] = await Promise.all([
    supabaseAdmin.from('clubs').select('*').order('created_at', { ascending: true }),
    supabaseAdmin.from('courts').select('*').order('created_at', { ascending: true }),
    supabaseAdmin.from('clips').select('id, court_id'),
  ]);

  const clubList = (clubs ?? []) as ClubRow[];
  const courtList = (courts ?? []) as CourtRow[];
  const clipList = (clips ?? []) as ClipRow[];

  const clipCountByCourtId = new Map<string, number>();
  for (const clip of clipList) {
    if (!clip.court_id) continue;
    clipCountByCourtId.set(
      clip.court_id,
      (clipCountByCourtId.get(clip.court_id) ?? 0) + 1
    );
  }

  return (
    <ReplayTrovePageShell
      title="Club Management"
      subtitle="Create clubs, assign courts, and review clip activity by court."
      maxWidth="1200px"
    >
      <div style={layout}>
        <div style={leftColumn}>
          <div style={card}>
            <h3 style={heading}>Courts by Club</h3>

            {clubList.length === 0 ? (
              <p style={{ color: '#666', margin: 0 }}>No clubs yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: '22px' }}>
                {clubList.map((club) => {
                  const clubCourts = courtList.filter((court) => court.club_id === club.id);

                  return (
                    <div key={club.id}>
                      <div style={clubTitle}>
                        {club.name || 'Unnamed Club'}
                      </div>

                      {clubCourts.length === 0 ? (
                        <div style={emptyText}>No courts yet.</div>
                      ) : (
                        <div style={{ display: 'grid', gap: '8px' }}>
                          {clubCourts.map((court) => {
                            const clipCount = clipCountByCourtId.get(court.id) ?? 0;

                            return (
                              <div key={court.id} style={courtRow}>
                                <div style={courtName}>
                                  {court.name || 'Unnamed Court'}
                                </div>
                                <div style={clipBadge}>
                                  {clipCount} clip{clipCount === 1 ? '' : 's'}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div style={rightColumn}>
          <div style={card}>
            <h3 style={heading}>Create Club</h3>

            <form action={createClubAction} style={inlineForm}>
              <input
                name="name"
                placeholder="Club Name"
                required
                style={input}
              />
              <button style={button}>Add</button>
            </form>
          </div>

          <div style={card}>
            <h3 style={heading}>Add Court</h3>

            <AddCourtForm
              clubs={clubList.map((club) => ({
                id: club.id,
                name: club.name,
              }))}
              action={createCourtAction}
            />
          </div>
        </div>
      </div>
    </ReplayTrovePageShell>
  );
}

const layout: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '2fr 1fr',
  gap: '24px',
};

const leftColumn: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const rightColumn: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const card: React.CSSProperties = {
  background: '#ffffff',
  padding: '20px',
  borderRadius: '14px',
  border: '1px solid #ececec',
  boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
};

const heading: React.CSSProperties = {
  margin: '0 0 14px',
};

const clubTitle: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: '10px',
  fontSize: '1.05rem',
  color: '#17191c',
};

const emptyText: React.CSSProperties = {
  fontSize: '0.9rem',
  color: '#888',
};

const courtRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '16px',
  padding: '10px 12px',
  borderRadius: '10px',
  background: '#fafafa',
  border: '1px solid #eee',
};

const courtName: React.CSSProperties = {
  fontWeight: 500,
  color: '#222',
};

const clipBadge: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#555',
  background: '#f1f3f5',
  border: '1px solid #e3e6ea',
  borderRadius: '999px',
  padding: '4px 10px',
  whiteSpace: 'nowrap',
};

const inlineForm: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
};

const input: React.CSSProperties = {
  flex: 1,
  padding: '12px',
  borderRadius: '10px',
  border: '1px solid #d6d6d6',
};

const button: React.CSSProperties = {
  padding: '12px 18px',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: '10px',
  fontWeight: 600,
  cursor: 'pointer',
};