'use server';

import { revalidatePath } from 'next/cache';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function createClubAction(formData: FormData) {
  const adminUser = await getAdminUser();

  if (!adminUser || adminUser.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }

  const name = String(formData.get('club_name') ?? '').trim();

  if (!name) {
    throw new Error('Club name is required.');
  }

  const { error } = await supabaseAdmin.from('clubs').insert({
    name,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/admin/clubs');
}

export async function createCourtAction(formData: FormData) {
  const adminUser = await getAdminUser();

  if (!adminUser || adminUser.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }

  const clubId = String(formData.get('club_id') ?? '').trim();
  const name = String(formData.get('court_name') ?? '').trim();

  if (!clubId) {
    throw new Error('Club is required.');
  }

  if (!name) {
    throw new Error('Court name is required.');
  }

  const { error } = await supabaseAdmin.from('courts').insert({
    club_id: clubId,
    name,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/admin/clubs');
}