'use server';

import { revalidatePath } from 'next/cache';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function createUserProfileAction(formData: FormData) {
  const adminUser = await getAdminUser();

  if (!adminUser || adminUser.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }

  const authUserId = String(formData.get('auth_user_id') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const role = String(formData.get('role') ?? '').trim();
  const clubId = String(formData.get('club_id') ?? '').trim();

  if (!authUserId) {
    throw new Error('Auth user is required.');
  }

  if (!email) {
    throw new Error('Email is required.');
  }

  if (!['club_admin', 'club_staff'].includes(role)) {
    throw new Error('Invalid role.');
  }

  if (!clubId) {
    throw new Error('Club is required.');
  }

  const { error } = await supabaseAdmin.from('users').insert({
    id: authUserId,
    email,
    role,
    club_id: clubId,
    is_active: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/admin/users');
  revalidatePath('/admin/clubs');
}

export async function toggleUserActiveAction(formData: FormData) {
  const adminUser = await getAdminUser();

  if (!adminUser || adminUser.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }

  const userId = String(formData.get('user_id') ?? '').trim();
  const nextActive = String(formData.get('next_active') ?? '').trim() === 'true';

  if (!userId) {
    throw new Error('User ID is required.');
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ is_active: nextActive })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/admin/users');
  revalidatePath('/admin/clubs');
}