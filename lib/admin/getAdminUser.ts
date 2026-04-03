import { createClient } from '@/lib/supabase/server';

export type AdminProfile = {
  id: string;
  email: string | null;
  role: 'super_admin' | 'club_admin' | 'club_staff';
  club_id: string | null;
};

export async function getAdminUser(): Promise<AdminProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  console.log('ADMIN AUTH USER:', user?.id, user?.email, authError?.message);

  if (authError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, email, role, club_id')
    .eq('id', user.id)
    .single();

  console.log('ADMIN PROFILE:', profile, profileError?.message);

  if (profileError || !profile) {
    return null;
  }

  if (!['super_admin', 'club_admin', 'club_staff'].includes(profile.role)) {
    return null;
  }

  return profile as AdminProfile;
}