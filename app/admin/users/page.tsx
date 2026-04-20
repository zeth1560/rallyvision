import { redirect } from 'next/navigation';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { formatDateInTimezone } from '@/lib/formatDate';
import {
  createUserProfileAction,
  toggleUserActiveAction,
} from './server-actions';

type UserRow = {
  id: string;
  email: string | null;
  role: string;
  club_id: string | null;
  is_active: boolean;
  created_at: string | null;
};

type ClubRow = {
  id: string;
  name: string | null;
};

export default async function AdminUsersPage() {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    redirect('/admin/login');
  }

  if (adminUser.role !== 'super_admin') {
    redirect('/admin/dashboard');
  }

  const [
    { data: usersData, error: usersError },
    { data: clubsData, error: clubsError },
    { data: authUsersData, error: authUsersError },
  ] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('id, email, role, club_id, is_active, created_at')
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('clubs').select('id, name').order('name'),
    supabaseAdmin.auth.admin.listUsers(),
  ]);

  if (usersError || clubsError || authUsersError) {
    const message =
      usersError?.message ||
      clubsError?.message ||
      authUsersError?.message ||
      'Unknown error';

    return (
      <ReplayTrovePageShell
        title="Admin Users"
        subtitle="Manage ReplayTrove admin and operator access."
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
            Failed to load user data.
          </p>
          <p style={{ marginBottom: 0, color: '#555' }}>{message}</p>
        </div>
      </ReplayTrovePageShell>
    );
  }

  const users = (usersData ?? []) as UserRow[];
  const clubs = (clubsData ?? []) as ClubRow[];
  const authUsers = authUsersData?.users ?? [];

  const clubNameById = new Map<string, string>();
  for (const club of clubs) {
    if (club.id) {
      clubNameById.set(club.id, club.name || 'Unknown Club');
    }
  }

  const existingProfileIds = new Set(users.map((user) => user.id));

  const availableAuthUsers = authUsers.filter(
    (authUser) => !existingProfileIds.has(authUser.id)
  );

  return (
    <ReplayTrovePageShell
      title="Admin Users"
      subtitle="Manage ReplayTrove admin and operator access."
      maxWidth="1400px"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(340px, 0.8fr)',
          gap: '24px',
          alignItems: 'start',
        }}
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
          <h2
            style={{
              marginTop: 0,
              marginBottom: '18px',
              fontSize: '1.25rem',
              color: '#17191c',
            }}
          >
            Existing Users
          </h2>

          {users.length === 0 ? (
            <p style={{ margin: 0, color: '#555' }}>No user profiles found.</p>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {users.map((user) => {
                const clubName = user.club_id
                  ? clubNameById.get(user.club_id) || 'Unknown Club'
                  : 'No Club';

                return (
                  <div
                    key={user.id}
                    style={{
                      border: '1px solid #ececec',
                      borderRadius: '12px',
                      padding: '16px',
                      background: '#fafafa',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '16px',
                        flexWrap: 'wrap',
                        alignItems: 'start',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            color: '#17191c',
                            marginBottom: '6px',
                          }}
                        >
                          {user.email || 'No email'}
                        </div>

                        <div
                          style={{
                            fontSize: '0.95rem',
                            color: '#555',
                            lineHeight: 1.6,
                          }}
                        >
                          <div>
                            <strong>Role:</strong> {user.role}
                          </div>
                          <div>
                            <strong>Club:</strong> {clubName}
                          </div>
                          <div>
                            <strong>Status:</strong>{' '}
                            {user.is_active ? 'Active' : 'Inactive'}
                          </div>
                          <div>
                            <strong>Created:</strong>{' '}
                            {user.created_at
                              ? formatDateInTimezone(user.created_at)
                              : '—'}
                          </div>
                        </div>
                      </div>

                      <form action={toggleUserActiveAction}>
                        <input type="hidden" name="user_id" value={user.id} />
                        <input
                          type="hidden"
                          name="next_active"
                          value={user.is_active ? 'false' : 'true'}
                        />
                        <button
                          type="submit"
                          style={{
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1px solid #d0d0d0',
                            background: '#ffffff',
                            color: '#17191c',
                            textDecoration: 'none',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {user.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gap: '20px' }}>
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
                fontSize: '1.2rem',
                color: '#17191c',
              }}
            >
              Add User Profile
            </h2>

            <p
              style={{
                marginTop: 0,
                marginBottom: '16px',
                color: '#555',
                lineHeight: 1.6,
                fontSize: '0.95rem',
              }}
            >
              This creates the ReplayTrove profile and permissions for an
              existing Supabase Auth user.
            </p>

            <form
              action={createUserProfileAction}
              style={{ display: 'grid', gap: '14px' }}
            >
              <div>
                <label
                  htmlFor="auth_user_id"
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: 700,
                    color: '#17191c',
                  }}
                >
                  Auth User
                </label>
                <select
                  id="auth_user_id"
                  name="auth_user_id"
                  required
                  defaultValue=""
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cfcfcf',
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                    background: '#fff',
                  }}
                >
                  <option value="" disabled>
                    Select a Supabase Auth user
                  </option>
                  {availableAuthUsers.map((authUser) => (
                    <option key={authUser.id} value={authUser.id}>
                      {authUser.email || authUser.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="email"
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: 700,
                    color: '#17191c',
                  }}
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="operator@example.com"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cfcfcf',
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="role"
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: 700,
                    color: '#17191c',
                  }}
                >
                  Role
                </label>
                <select
                  id="role"
                  name="role"
                  required
                  defaultValue="club_admin"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cfcfcf',
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                    background: '#fff',
                  }}
                >
                  <option value="club_admin">club_admin</option>
                  <option value="club_staff">club_staff</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="club_id"
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontWeight: 700,
                    color: '#17191c',
                  }}
                >
                  Club
                </label>
                <select
                  id="club_id"
                  name="club_id"
                  required
                  defaultValue=""
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cfcfcf',
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                    background: '#fff',
                  }}
                >
                  <option value="" disabled>
                    Select a club
                  </option>
                  {clubs.map((club) => (
                    <option key={club.id} value={club.id}>
                      {club.name || 'Unnamed Club'}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#111111',
                  color: '#ffffff',
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Create User Profile
              </button>
            </form>
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
                marginBottom: '12px',
                fontSize: '1.1rem',
                color: '#17191c',
              }}
            >
              Quick Note
            </h2>

            <p
              style={{
                margin: 0,
                color: '#555',
                lineHeight: 1.6,
                fontSize: '0.95rem',
              }}
            >
              New users should still be created in Supabase Authentication first.
              This page links them to a club and assigns their ReplayTrove role.
            </p>
          </div>
        </div>
      </div>
    </ReplayTrovePageShell>
  );
}