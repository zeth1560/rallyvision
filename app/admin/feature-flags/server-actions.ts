'use server';

import { revalidatePath } from 'next/cache';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import {
  isFeatureFlagKey,
  updateFeatureFlag,
  type FeatureFlagKey,
} from '@/lib/feature-flags';

export async function updateFeatureFlagAction(formData: FormData) {
  const adminUser = await getAdminUser();

  if (!adminUser || adminUser.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }

  const keyRaw = String(formData.get('key') ?? '').trim();
  const enabledRaw = String(formData.get('enabled') ?? '').trim();

  if (!isFeatureFlagKey(keyRaw)) {
    throw new Error('Invalid feature flag key.');
  }

  const enabled = enabledRaw === 'true' || enabledRaw === 'on' || enabledRaw === '1';

  await updateFeatureFlag({
    key: keyRaw as FeatureFlagKey,
    enabled,
    updatedByEmail: adminUser.email ?? 'unknown',
  });

  revalidatePath('/admin/feature-flags');
  revalidatePath('/admin/dashboard');
  revalidatePath('/player-trove');
  revalidatePath('/success');
}
