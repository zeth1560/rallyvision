import Link from 'next/link';
import { redirect } from 'next/navigation';
import ReplayTrovePageShell from '@/app/components/ReplayTrovePageShell';
import FeatureFlagToggleForm from '@/app/admin/feature-flags/FeatureFlagToggleForm';
import { getAdminUser } from '@/lib/admin/getAdminUser';
import { getFeatureFlagRowsForAdmin } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

export default async function AdminFeatureFlagsPage() {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    redirect('/admin/login');
  }

  if (adminUser.role !== 'super_admin') {
    return (
      <ReplayTrovePageShell
        title="Feature Flags"
        subtitle="Control customer-facing add-on availability."
        maxWidth="900px"
      >
        <div style={panelStyle}>
          <p style={{ marginTop: 0, color: '#b00020', fontWeight: 700 }}>
            Super admin access is required to manage feature flags.
          </p>
          <Link href="/admin/dashboard" style={navButton}>
            Back to dashboard
          </Link>
        </div>
      </ReplayTrovePageShell>
    );
  }

  const flags = await getFeatureFlagRowsForAdmin();

  return (
    <ReplayTrovePageShell
      title="Feature Flags"
      subtitle="Turn customer-facing add-ons on or off without redeploying."
      maxWidth="900px"
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '20px',
        }}
      >
        <div style={{ fontSize: '0.95rem', color: '#555' }}>
          Logged in as <strong>{adminUser.email}</strong>
        </div>
        <Link href="/admin/dashboard" style={navButton}>
          Dashboard
        </Link>
      </div>

      <div style={panelStyle}>
        <p style={{ marginTop: 0, color: '#555', lineHeight: 1.6 }}>
          Disabling a feature hides new purchases and upsell prompts. Players who already
          bought an add-on keep access to what they purchased.
        </p>

        <div style={{ display: 'grid', gap: '14px' }}>
          {flags.map((flag) => (
            <FeatureFlagToggleForm key={flag.key} flag={flag} />
          ))}
        </div>
      </div>
    </ReplayTrovePageShell>
  );
}

const panelStyle: React.CSSProperties = {
  border: '1px solid #dedede',
  borderRadius: '16px',
  padding: '24px',
  background: '#ffffff',
  boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
};

const navButton: React.CSSProperties = {
  display: 'inline-block',
  padding: '12px 18px',
  borderRadius: '10px',
  border: '1px solid #d0d0d0',
  background: '#ffffff',
  color: '#17191c',
  textDecoration: 'none',
  fontWeight: 700,
};
