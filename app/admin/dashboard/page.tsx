import Link from 'next/link';
import { redirect } from 'next/navigation';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { formatDateInTimezone } from '@/lib/formatDate';

type CountResult = {
  count: number | null;
};

export default async function AdminDashboardPage() {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    redirect('/admin/login');
  }

  const clipsQuery = supabaseAdmin
    .from('clips')
    .select('*', { count: 'exact', head: true });

  const todaysClipsQuery = supabaseAdmin
    .from('clips')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

  const recentClipsQuery = supabaseAdmin
    .from('clips')
    .select('id, title, slug, created_at, club_id')
    .order('created_at', { ascending: false })
    .limit(8);

  let filteredClipsQuery = clipsQuery;
  let filteredTodaysClipsQuery = todaysClipsQuery;
  let filteredRecentClipsQuery = recentClipsQuery;

  if (adminUser.role !== 'super_admin' && adminUser.club_id) {
    filteredClipsQuery = filteredClipsQuery.eq('club_id', adminUser.club_id);
    filteredTodaysClipsQuery = filteredTodaysClipsQuery.eq('club_id', adminUser.club_id);
    filteredRecentClipsQuery = filteredRecentClipsQuery.eq('club_id', adminUser.club_id);
  }

  const [
    { count: totalClips, error: totalClipsError },
    { count: todaysClips, error: todaysClipsError },
    { data: recentClips, error: recentClipsError },
    { data: clubsData, error: clubsError },
  ] = await Promise.all([
    filteredClipsQuery,
    filteredTodaysClipsQuery,
    filteredRecentClipsQuery,
    supabaseAdmin.from('clubs').select('id, name'),
  ]);

  if (totalClipsError || todaysClipsError || recentClipsError || clubsError) {
    const message =
      totalClipsError?.message ||
      todaysClipsError?.message ||
      recentClipsError?.message ||
      clubsError?.message ||
      'Unknown error';

    return (
      <ReplayTrovePageShell
        title="Admin Dashboard"
        subtitle="Monitor system activity and access clip management tools."
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
            Failed to load dashboard data.
          </p>
          <p style={{ marginBottom: 0, color: '#555' }}>{message}</p>
        </div>
      </ReplayTrovePageShell>
    );
  }

  const clubNameById = new Map<string, string>();
  for (const club of clubsData ?? []) {
    if (club.id) {
      clubNameById.set(club.id, club.name || 'Unknown Club');
    }
  }

  return (
    <ReplayTrovePageShell
      title="Admin Dashboard"
      subtitle="Monitor system activity and access clip management tools."
      maxWidth="1400px"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '18px',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '20px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
          }}
        >
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
            Logged in as
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#17191c' }}>
            {adminUser.email}
          </div>
        </div>

        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '20px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
          }}
        >
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
            Role
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#17191c' }}>
            {adminUser.role}
          </div>
        </div>

        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '20px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
          }}
        >
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
            Total Clips
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#17191c' }}>
            {totalClips ?? 0}
          </div>
        </div>

        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '20px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
          }}
        >
          <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
            Clips Added Today
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#17191c' }}>
            {todaysClips ?? 0}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '24px',
        }}
      >
        <Link
  href="/admin/clubs"
  style={{
    display: 'inline-block',
    padding: '12px 18px',
    borderRadius: '10px',
    border: '1px solid #d0d0d0',
    background: '#ffffff',
    color: '#17191c',
    textDecoration: 'none',
    fontWeight: 700,
  }}
>
  Manage Clubs
</Link>
<Link
  href="/admin/users"
  style={{
    display: 'inline-block',
    padding: '12px 18px',
    borderRadius: '10px',
    border: '1px solid #d0d0d0',
    background: '#ffffff',
    color: '#17191c',
    textDecoration: 'none',
    fontWeight: 700,
  }}
>
  Manage Users
</Link>
<Link
  href="/admin/pricing"
  style={{
    display: 'inline-block',
    padding: '12px 18px',
    borderRadius: '10px',
    border: '1px solid #d0d0d0',
    background: '#ffffff',
    color: '#17191c',
    textDecoration: 'none',
    fontWeight: 700,
  }}
>
  Manage Pricing
</Link>
<Link
  href="/admin/promo-codes"
  style={{
    display: 'inline-block',
    padding: '12px 18px',
    borderRadius: '10px',
    border: '1px solid #d0d0d0',
    background: '#ffffff',
    color: '#17191c',
    textDecoration: 'none',
    fontWeight: 700,
  }}
>
  Promo Codes
</Link>
<Link
  href="/admin/pb-vision-requests"
  style={{
    display: 'inline-block',
    padding: '12px 18px',
    borderRadius: '10px',
    border: '1px solid #d0d0d0',
    background: '#ffffff',
    color: '#17191c',
    textDecoration: 'none',
    fontWeight: 700,
  }}
>
  PB Vision Requests
</Link>
        <Link
          href="/admin/clips"
          style={{
            display: 'inline-block',
            padding: '12px 18px',
            borderRadius: '10px',
            background: '#111111',
            color: '#ffffff',
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          Open Clip Library
        </Link>

        <Link
          href="/admin/login"
          style={{
            display: 'inline-block',
            padding: '12px 18px',
            borderRadius: '10px',
            border: '1px solid #d0d0d0',
            background: '#ffffff',
            color: '#17191c',
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          Admin Login
        </Link>
      </div>

      <div
        style={{
          border: '1px solid #dedede',
          borderRadius: '16px',
          padding: '24px',
          background: '#ffffff',
          boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
        }}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: '16px',
            fontSize: '1.25rem',
            color: '#17191c',
          }}
        >
          Recent Clips
        </h2>

        {!recentClips || recentClips.length === 0 ? (
          <p style={{ margin: 0, color: '#555' }}>No recent clips found.</p>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {recentClips.map((clip) => {
              const clubName = clip.club_id
                ? clubNameById.get(clip.club_id) || 'Unknown Club'
                : 'Unknown Club';

              return (
                <div
                  key={clip.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    flexWrap: 'wrap',
                    padding: '14px 16px',
                    border: '1px solid #ececec',
                    borderRadius: '12px',
                    background: '#fafafa',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        color: '#17191c',
                        marginBottom: '4px',
                      }}
                    >
                      {clip.title || clip.slug || clip.id}
                    </div>

                    <div
                      style={{
                        fontSize: '0.9rem',
                        color: '#666',
                      }}
                    >
                      {clip.created_at
                        ? formatDateInTimezone(clip.created_at)
                        : '—'}
                      {' • '}
                      {clubName}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {clip.slug ? (
                      <Link
                        href={`/clip/${clip.slug}`}
                        style={{
                          display: 'inline-block',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          border: '1px solid #d0d0d0',
                          background: '#ffffff',
                          color: '#17191c',
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                      >
                        Public Page
                      </Link>
                    ) : null}
                    <Link
                      href="/admin/clips"
                      style={{
                        display: 'inline-block',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background: '#111111',
                        color: '#ffffff',
                        textDecoration: 'none',
                        fontWeight: 600,
                      }}
                    >
                      Manage Clips
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ReplayTrovePageShell>
  );
}