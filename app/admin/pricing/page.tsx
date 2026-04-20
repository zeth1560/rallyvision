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
        'id, rule_name, rule_level, club_id, court_id, is_active, pricing_mode, fixed_price_cents, min_price_cents, max_price_cents, created_at'
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

  return (
    <ReplayTrovePageShell
      title="Pricing Rules"
      subtitle="Manage ReplayTrove pricing across global, club, and court levels."
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
                            <strong>Level:</strong> {rule.rule_level || '—'}
                          </div>
                          <div>
                            <strong>Target:</strong> {targetLabel}
                          </div>
                          <div>
                            <strong>Mode:</strong> {rule.pricing_mode || '—'}
                          </div>
                          <div>
                            <strong>Fixed Price:</strong>{' '}
                            {formatPrice(rule.fixed_price_cents)}
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