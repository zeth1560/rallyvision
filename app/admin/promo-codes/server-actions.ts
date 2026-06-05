'use server';

import { revalidatePath } from 'next/cache';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizePromoCodeInput } from '@/lib/commerce/promo';
import { isProductType, type ProductType } from '@/lib/commerce/products';

export async function createPromoCodeAction(formData: FormData) {
  const adminUser = await getAdminUser();

  if (!adminUser || adminUser.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }

  const code = normalizePromoCodeInput(String(formData.get('code') ?? ''));
  const description = String(formData.get('description') ?? '').trim();
  const discountType = String(formData.get('discount_type') ?? '').trim();
  const scopeType = String(formData.get('scope_type') ?? '').trim();
  const productTypeRaw = String(formData.get('product_type') ?? '').trim();
  const expiresAtRaw = String(formData.get('expires_at') ?? '').trim();
  const maxRedemptionsRaw = String(formData.get('max_redemptions') ?? '').trim();
  const oncePerEmail = formData.get('once_per_email') === 'on';
  const isActive = formData.get('is_active') !== 'off';

  if (!code) {
    throw new Error('Promo code is required.');
  }

  if (!['percentage', 'fixed_amount', 'free'].includes(discountType)) {
    throw new Error('Invalid discount type.');
  }

  if (!['product', 'cart'].includes(scopeType)) {
    throw new Error('Invalid scope type.');
  }

  let discountValue = 0;

  if (discountType === 'free') {
    discountValue = 100;
  } else if (discountType === 'percentage') {
    const parsed = Number(String(formData.get('discount_value') ?? '').trim());

    if (Number.isNaN(parsed) || parsed <= 0 || parsed > 100) {
      throw new Error('Percentage must be between 1 and 100.');
    }

    discountValue = Math.round(parsed);
  } else {
    const dollars = Number(String(formData.get('discount_value') ?? '').trim());

    if (Number.isNaN(dollars) || dollars <= 0) {
      throw new Error('Fixed discount must be a positive dollar amount.');
    }

    discountValue = Math.round(dollars * 100);
  }

  let productType: ProductType | null = null;

  if (scopeType === 'product') {
    if (!productTypeRaw || !isProductType(productTypeRaw)) {
      throw new Error('Product type is required for product-scoped promos.');
    }

    productType = productTypeRaw;
  }

  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null;
  const maxRedemptions = maxRedemptionsRaw
    ? Number(maxRedemptionsRaw)
    : null;

  if (maxRedemptions != null && (Number.isNaN(maxRedemptions) || maxRedemptions < 1)) {
    throw new Error('Max redemptions must be a positive number.');
  }

  const { error } = await supabaseAdmin.from('promo_codes').insert({
    code,
    description: description || null,
    discount_type: discountType,
    discount_value: discountValue,
    scope_type: scopeType,
    product_type: productType,
    expires_at: expiresAt,
    max_redemptions: maxRedemptions,
    once_per_email: oncePerEmail,
    is_active: isActive,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/admin/promo-codes');
}

export async function togglePromoCodeActiveAction(formData: FormData) {
  const adminUser = await getAdminUser();

  if (!adminUser || adminUser.role !== 'super_admin') {
    throw new Error('Unauthorized');
  }

  const id = String(formData.get('id') ?? '').trim();
  const isActive = formData.get('is_active') === 'true';

  if (!id) {
    throw new Error('Promo code id is required.');
  }

  const { error } = await supabaseAdmin
    .from('promo_codes')
    .update({ is_active: isActive })
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/admin/promo-codes');
}
