import { redirect } from 'next/navigation';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { formatDateInTimezone } from '@/lib/formatDate';
import {
  createPricingRuleAction,
  togglePricingRuleActiveAction,
  deletePricingRuleAction,
} from './server-actions';
import { PRODUCT_LABELS } from '@/lib/commerce/cart-payload';
import {
  findOverlappingActivePricingRules,
  formatPricingOverlapTarget,
} from '@/lib/commerce/pricing-overlap';
import type { ProductType } from '@/lib/commerce/products';

type PricingRuleRow = {
  id: string;
  rule_name: string | null;
  rule_level: string | null;
  club_id: string | null;
  court_id: string | null;
  is_active: boolean;
  pricing_mode: string | null;
  fixed_price_cents: number | null;
  min_price_cents: number | null;
  max_price_cents: number | null;
  product_type: string | null;
  created_at: string | null;
};

type ClubRow = {
  id: string;
  name: string | null;
};

type CourtRow = {
  id: string;
  club_id: string;
  name: string | null;
};

function formatPrice(cents: number | null) {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function formatProductType(productType: string | null) {
  if (!productType) {
    return PRODUCT_LABELS.clip_download;
  }

  if (productType in PRODUCT_LABELS) {
    return PRODUCT_LABELS[productType as ProductType];
  }

  return productType;
}

function formatPriceLabel(productType: string | null) {
  if (productType === 'session_bundle') {
    return 'Hourly Rate';
  }

  return 'Fixed Price';
}

export default async function AdminPricingPage() {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    redirect('/admin/login');
  }

  if (adminUser.role !== 'super_admin') {
    redirect('/admin/dashboard');
  }

  const [
    { data: rulesData, error: rulesError },
    { data: clubsData, error: clubsError },
    { data: courtsData, error: courtsError },
  ] = await Promise.all([
    supabaseAdmin
      .from('pricing_rules')
      .select(
        'id, rule_name, rule_level, club_id, court_id, is_active, pricing_mode, fixed_price_cents, min_price_cents, max_price_cents, product_type, created_at'
      )
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('clubs').select('id, name').order('name'),
    supabaseAdmin.from('courts').select('id, club_id, name').order('name'),
  ]);

  if (rulesError || clubsError || courtsError) {
    const message =
      rulesError?.message ||
      clubsError?.message ||
      courtsError?.message ||
      'Unknown error';

    return (
      <ReplayTrovePageShell
        title="Pricing Rules"
        subtitle="Manage ReplayTrove pricing across global, club, and court levels."
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
            Failed to load pricing data.
          </p>
          <p style={{ marginBottom: 0, color: '#555' }}>{message}</p>
        </div>
      </ReplayTrovePageShell>
    );
  }

  const rules = (rulesData ?? []) as PricingRuleRow[];
  const clubs = (clubsData ?? []) as ClubRow[];
  const courts = (courtsData ?? []) as CourtRow[];

  const clubNameById = new Map<string, string>();
  for (const club of clubs) {
    if (club.id) {
      clubNameById.set(club.id, club.name || 'Unknown Club');
    }
  }

  const courtLabelById = new Map<string, string>();
  for (const court of courts) {
    const clubName = clubNameById.get(court.club_id) || 'Unknown Club';
    courtLabelById.set(
      court.id,
      `${clubName} • ${court.name || 'Unnamed Court'}`
    );
  }

  const overlapGroups = findOverlappingActivePricingRules(rules);

  return (
    <ReplayTrovePageShell
      title="Pricing Rules"
      subtitle="Manage ReplayTrove pricing across global, club, and court levels."
      maxWidth="1400px"
    >
      {overlapGroups.length > 0 ? (
        <div
          style={{
            border: '1px solid #f0c36d',
            borderRadius: '16px',
            padding: '18px 20px',
            background: '#fff8eb',
            marginBottom: '24px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: '10px',
              fontSize: '1.05rem',
              color: '#8a5a00',
            }}
          >
            Overlapping Active Pricing Rules
          </h2>
          <p style={{ marginTop: 0, marginBottom: '14px', color: '#6b4f1d' }}>
            Multiple active rules match the same product and scope. Checkout uses
            the newest rule silently. Deactivate or delete duplicates to avoid
            confusion.
          </p>
          <div style={{ display: 'grid', gap: '12px' }}>
            {overlapGroups.map((group) => (
              <div
                key={group.key}
                style={{
                  border: '1px solid #f0d7a4',
                  borderRadius: '12px',
                  padding: '14px',
                  background: '#fffdf8',
                }}
              >
                <div style={{ fontWeight: 700, color: '#17191c', marginBottom: '6px' }}>
                  {formatProductType(group.productType)} • {group.ruleLevel} •{' '}
                  {formatPricingOverlapTarget(
                    group,
                    clubNameById,
                    courtLabelById
                  )}
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', color: '#555' }}>
                  {group.rules.map((rule) => (
                    <li key={rule.id}>
                      {rule.rule_name || 'Unnamed Rule'}
                      {rule.created_at
                        ? ` (created ${formatDateInTimezone(rule.created_at)})`
                        : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
            Existing Pricing Rules
          </h2>

          {rules.length === 0 ? (
            <p style={{ margin: 0, color: '#555' }}>No pricing rules found.</p>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {rules.map((rule) => {
                let targetLabel = 'Global Default';

                if (rule.rule_level === 'club' && rule.club_id) {
                  targetLabel = clubNameById.get(rule.club_id) || 'Unknown Club';
                }

                if (rule.rule_level === 'court' && rule.court_id) {
                  targetLabel =
                    courtLabelById.get(rule.court_id) || 'Unknown Court';
                }

                return (
                  <div
                    key={rule.id}
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
                          {rule.rule_name || 'Unnamed Rule'}
                        </div>

                        <div
                          style={{
                            fontSize: '0.95rem',
                            color: '#555',
                            lineHeight: 1.6,
                          }}
                        >
                          <div>
                            <strong>Product:</strong>{' '}
                            {formatProductType(rule.product_type)}
                          </div>
                          <div>
                            <strong>Level:</strong> {rule.rule_level || '—'}
                          </div>
                          <div>
                            <strong>Target:</strong> {targetLabel}
                          </div>
                          <div>
                            <strong>Mode:</strong> {rule.pricing_mode || '—'}
                          </div>
                          <div>
                            <strong>{formatPriceLabel(rule.product_type)}:</strong>{' '}
                            {formatPrice(rule.fixed_price_cents)}
                            {rule.product_type === 'session_bundle' &&
                            rule.fixed_price_cents != null
                              ? ' / hr'
                              : ''}
                          </div>
                          <div>
                            <strong>Status:</strong>{' '}
                            {rule.is_active ? 'Active' : 'Inactive'}
                          </div>
                          <div>
                            <strong>Created:</strong>{' '}
                            {rule.created_at
                              ? formatDateInTimezone(rule.created_at)
                              : '—'}
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          gap: '10px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <form action={togglePricingRuleActiveAction}>
                          <input type="hidden" name="rule_id" value={rule.id} />
                          <input
                            type="hidden"
                            name="next_active"
                            value={rule.is_active ? 'false' : 'true'}
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
                            {rule.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </form>

                        <form action={deletePricingRuleAction}>
                          <input type="hidden" name="rule_id" value={rule.id} />
                          <button
                            type="submit"
                            style={{
                              padding: '10px 14px',
                              borderRadius: '10px',
                              border: '1px solid #e1b7b7',
                              background: '#fff5f5',
                              color: '#8f1f1f',
                              textDecoration: 'none',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
              fontSize: '1.2rem',
              color: '#17191c',
            }}
          >
            Add Pricing Rule
          </h2>

          <form
            action={createPricingRuleAction}
            style={{ display: 'grid', gap: '14px' }}
          >
            <div>
              <label
                htmlFor="rule_name"
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 700,
                  color: '#17191c',
                }}
              >
                Rule Name
              </label>
              <input
                id="rule_name"
                name="rule_name"
                type="text"
                required
                placeholder="Rally Club Default Pricing"
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
                htmlFor="product_type"
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 700,
                  color: '#17191c',
                }}
              >
                Product Type
              </label>
              <select
                id="product_type"
                name="product_type"
                required
                defaultValue="clip_download"
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
                <option value="clip_download">Clip Download (&lt; 5 min)</option>
                <option value="full_game_hd">Full Game HD (≥ 5 min)</option>
                <option value="pb_vision">PB Vision Analysis</option>
                <option value="coach_review">Coach Review</option>
                <option value="session_bundle">Session Bundle (hourly rate)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="rule_level"
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 700,
                  color: '#17191c',
                }}
              >
                Rule Level
              </label>
              <select
                id="rule_level"
                name="rule_level"
                required
                defaultValue="global"
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
                <option value="global">global</option>
                <option value="club">club</option>
                <option value="court">court</option>
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
                Club (optional unless club rule)
              </label>
              <select
                id="club_id"
                name="club_id"
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
                <option value="">None</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>
                    {club.name || 'Unnamed Club'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="court_id"
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 700,
                  color: '#17191c',
                }}
              >
                Court (optional unless court rule)
              </label>
              <select
                id="court_id"
                name="court_id"
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
                <option value="">None</option>
                {courts.map((court) => (
                  <option key={court.id} value={court.id}>
                    {courtLabelById.get(court.id) || court.name || 'Unnamed Court'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="pricing_mode"
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 700,
                  color: '#17191c',
                }}
              >
                Pricing Mode
              </label>
              <select
                id="pricing_mode"
                name="pricing_mode"
                required
                defaultValue="free"
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
                <option value="free">free</option>
                <option value="fixed">fixed</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="fixed_price_dollars"
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: 700,
                  color: '#17191c',
                }}
              >
                Fixed Price (USD)
              </label>
              <p style={{ margin: '0 0 8px', color: '#666', fontSize: '0.85rem' }}>
                For Session Bundle rules, enter the hourly rate (e.g. 9.99 = $9.99/hr).
              </p>
              <input
                id="fixed_price_dollars"
                name="fixed_price_dollars"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.99"
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
              Create Pricing Rule
            </button>
          </form>
        </div>
      </div>
    </ReplayTrovePageShell>
  );
}