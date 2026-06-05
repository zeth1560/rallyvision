import { redirect } from 'next/navigation';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { formatDateInTimezone } from '@/lib/formatDate';
import { PRODUCT_LABELS } from '@/lib/commerce/cart-payload';
import { formatPromoDiscountLabel, type PromoCodeRow } from '@/lib/commerce/promo';
import type { ProductType } from '@/lib/commerce/products';
import {
  createPromoCodeAction,
  togglePromoCodeActiveAction,
} from './server-actions';

type PromoCodeListRow = PromoCodeRow;

function formatScope(row: PromoCodeListRow) {
  if (row.scope_type === 'cart') {
    return 'Entire cart';
  }

  if (row.product_type && row.product_type in PRODUCT_LABELS) {
    return PRODUCT_LABELS[row.product_type as ProductType];
  }

  return row.product_type ?? 'Product';
}

export default async function AdminPromoCodesPage() {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    redirect('/admin/login');
  }

  if (adminUser.role !== 'super_admin') {
    redirect('/admin/dashboard');
  }

  const { data: promoData, error: promoError } = await supabaseAdmin
    .from('promo_codes')
    .select(
      'id, code, description, discount_type, discount_value, scope_type, product_type, expires_at, max_redemptions, once_per_email, is_active, created_at'
    )
    .order('created_at', { ascending: false });

  const promoCodes = (promoData ?? []) as PromoCodeListRow[];

  const redemptionCounts = await Promise.all(
    promoCodes.map(async (promo) => {
      const { count } = await supabaseAdmin
        .from('promo_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('promo_code_id', promo.id);

      return { id: promo.id, count: count ?? 0 };
    })
  );

  const redemptionCountById = new Map(
    redemptionCounts.map((entry) => [entry.id, entry.count])
  );

  return (
    <ReplayTrovePageShell
      title="Promo Codes"
      subtitle="Create scoped discounts for session checkout and PlayerTrove upsells."
      maxWidth="1200px"
    >
      {promoError ? (
        <div style={{ color: '#b00020', marginBottom: '20px' }}>
          Failed to load promo codes: {promoError.message}
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 380px) minmax(0, 1fr)',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        <section
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '20px',
            background: '#fff',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Create Promo Code</h2>
          <form action={createPromoCodeAction} style={{ display: 'grid', gap: '12px' }}>
            <label style={{ display: 'grid', gap: '4px' }}>
              <span>Code</span>
              <input name="code" required placeholder="FREEPBVISION" />
            </label>

            <label style={{ display: 'grid', gap: '4px' }}>
              <span>Description</span>
              <input name="description" placeholder="One-time free PB Vision" />
            </label>

            <label style={{ display: 'grid', gap: '4px' }}>
              <span>Discount Type</span>
              <select name="discount_type" defaultValue="percentage" required>
                <option value="percentage">Percentage</option>
                <option value="fixed_amount">Fixed dollar amount</option>
                <option value="free">Free / 100% off</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: '4px' }}>
              <span>Discount Value (% or $)</span>
              <input name="discount_value" placeholder="20 or 5.00" />
            </label>

            <label style={{ display: 'grid', gap: '4px' }}>
              <span>Scope</span>
              <select name="scope_type" defaultValue="product" required>
                <option value="product">Specific product</option>
                <option value="cart">Entire cart</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: '4px' }}>
              <span>Product (for product scope)</span>
              <select name="product_type" defaultValue="pb_vision">
                <option value="clip_download">Clip Download</option>
                <option value="full_game_hd">HD Video</option>
                <option value="pb_vision">PB Vision</option>
                <option value="coach_review">Coach Review</option>
                <option value="session_bundle">Session Bundle</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: '4px' }}>
              <span>Expires At</span>
              <input name="expires_at" type="datetime-local" />
            </label>

            <label style={{ display: 'grid', gap: '4px' }}>
              <span>Max Redemptions</span>
              <input name="max_redemptions" type="number" min="1" placeholder="Optional" />
            </label>

            <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input name="once_per_email" type="checkbox" />
              <span>One-time use per email</span>
            </label>

            <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input name="is_active" type="checkbox" defaultChecked />
              <span>Active</span>
            </label>

            <button
              type="submit"
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: 'none',
                background: '#111',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Create Promo Code
            </button>
          </form>
        </section>

        <section
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '20px',
            background: '#fff',
            overflowX: 'auto',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Existing Promo Codes</h2>

          {promoCodes.length === 0 ? (
            <p style={{ color: '#666' }}>No promo codes yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                  <th style={{ padding: '8px' }}>Code</th>
                  <th style={{ padding: '8px' }}>Discount</th>
                  <th style={{ padding: '8px' }}>Scope</th>
                  <th style={{ padding: '8px' }}>Redemptions</th>
                  <th style={{ padding: '8px' }}>Expires</th>
                  <th style={{ padding: '8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {promoCodes.map((promo) => (
                  <tr key={promo.id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                    <td style={{ padding: '8px', fontWeight: 700 }}>{promo.code}</td>
                    <td style={{ padding: '8px' }}>
                      {formatPromoDiscountLabel(promo)}
                    </td>
                    <td style={{ padding: '8px' }}>{formatScope(promo)}</td>
                    <td style={{ padding: '8px' }}>
                      {redemptionCountById.get(promo.id) ?? 0}
                      {promo.max_redemptions != null ? ` / ${promo.max_redemptions}` : ''}
                      {promo.once_per_email ? ' · once/email' : ''}
                    </td>
                    <td style={{ padding: '8px' }}>
                      {promo.expires_at
                        ? formatDateInTimezone(promo.expires_at)
                        : '—'}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <form action={togglePromoCodeActiveAction}>
                        <input type="hidden" name="id" value={promo.id} />
                        <input
                          type="hidden"
                          name="is_active"
                          value={promo.is_active ? 'false' : 'true'}
                        />
                        <button
                          type="submit"
                          style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: 'none',
                            background: promo.is_active ? '#198754' : '#6c757d',
                            color: '#fff',
                            cursor: 'pointer',
                          }}
                        >
                          {promo.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </ReplayTrovePageShell>
  );
}
