'use server';

import { revalidatePath } from 'next/cache';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function createPricingRuleAction(formData: FormData) {
  const adminUser = await getAdminUser();

  if (!adminUser || adminUser.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }

  const ruleName = String(formData.get('rule_name') ?? '').trim();
  const ruleLevel = String(formData.get('rule_level') ?? '').trim();
  const clubIdRaw = String(formData.get('club_id') ?? '').trim();
  const courtIdRaw = String(formData.get('court_id') ?? '').trim();
  const pricingMode = String(formData.get('pricing_mode') ?? '').trim();
  const productType = String(formData.get('product_type') ?? 'clip_download').trim();
  const fixedPriceRaw = String(formData.get('fixed_price_dollars') ?? '').trim();

  if (!ruleName) {
    throw new Error('Rule name is required.');
  }

  if (
    ![
      'clip_download',
      'full_game_hd',
      'pb_vision',
      'coach_review',
      'session_bundle',
    ].includes(productType)
  ) {
    throw new Error('Invalid product type.');
  }

  if (!['global', 'club', 'court'].includes(ruleLevel)) {
    throw new Error('Invalid rule level.');
  }

  if (!['free', 'fixed'].includes(pricingMode)) {
    throw new Error('Invalid pricing mode.');
  }

  const clubId = clubIdRaw || null;
  const courtId = courtIdRaw || null;

  if (ruleLevel === 'club' && !clubId) {
    throw new Error('Club is required for a club rule.');
  }

  if (ruleLevel === 'court' && !courtId) {
    throw new Error('Court is required for a court rule.');
  }

  let fixedPriceCents: number | null = null;

  if (pricingMode === 'fixed') {
    if (!fixedPriceRaw) {
      throw new Error('Fixed price is required for fixed pricing.');
    }

    const parsed = Number(fixedPriceRaw);

    if (Number.isNaN(parsed) || parsed < 0) {
      throw new Error('Fixed price must be a valid number.');
    }

    fixedPriceCents = Math.round(parsed * 100);
  }

  const { error } = await supabaseAdmin.from('pricing_rules').insert({
    rule_name: ruleName,
    rule_level: ruleLevel,
    club_id:
      ruleLevel === 'club'
        ? clubId
        : ruleLevel === 'court'
        ? clubId
        : null,
    court_id: ruleLevel === 'court' ? courtId : null,
    is_active: true,
    pricing_mode: pricingMode,
    fixed_price_cents: fixedPriceCents,
    product_type: productType,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/admin/pricing');
}

export async function togglePricingRuleActiveAction(formData: FormData) {
  const adminUser = await getAdminUser();

  if (!adminUser || adminUser.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }

  const ruleId = String(formData.get('rule_id') ?? '').trim();
  const nextActive = String(formData.get('next_active') ?? '').trim() === 'true';

  if (!ruleId) {
    throw new Error('Rule ID is required.');
  }

  const { error } = await supabaseAdmin
    .from('pricing_rules')
    .update({ is_active: nextActive })
    .eq('id', ruleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/admin/pricing');
}

export async function deletePricingRuleAction(formData: FormData) {
  const adminUser = await getAdminUser();

  if (!adminUser || adminUser.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }

  const ruleId = String(formData.get('rule_id') ?? '').trim();

  if (!ruleId) {
    throw new Error('Rule ID is required.');
  }

  const { error } = await supabaseAdmin
    .from('pricing_rules')
    .delete()
    .eq('id', ruleId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/admin/pricing');
}
