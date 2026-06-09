'use client';

import { useTransition } from 'react';
import { updateFeatureFlagAction } from '@/app/admin/feature-flags/server-actions';
import type { FeatureFlagRow } from '@/lib/feature-flags';

type FeatureFlagToggleFormProps = {
  flag: FeatureFlagRow;
};

export default function FeatureFlagToggleForm({ flag }: FeatureFlagToggleFormProps) {
  const [isPending, startTransition] = useTransition();

  function handleToggle(nextEnabled: boolean) {
    const formData = new FormData();
    formData.set('key', flag.key);
    formData.set('enabled', nextEnabled ? 'true' : 'false');

    startTransition(async () => {
      try {
        await updateFeatureFlagAction(formData);
      } catch (error) {
        console.error('[FeatureFlags] Update failed', error);
        window.alert(
          error instanceof Error ? error.message : 'Failed to update feature flag'
        );
      }
    });
  }

  return (
    <div
      style={{
        padding: '18px',
        border: '1px solid #ececec',
        borderRadius: '12px',
        background: '#fafafa',
        display: 'grid',
        gap: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#17191c' }}>
            {flag.label}
          </div>
          <div style={{ marginTop: '6px', fontSize: '0.9rem', color: '#555', lineHeight: 1.5 }}>
            {flag.description}
          </div>
          <div style={{ marginTop: '8px', fontSize: '0.8rem', color: '#777' }}>
            Key: <code>{flag.key}</code>
          </div>
        </div>

        <span
          style={{
            display: 'inline-block',
            padding: '4px 10px',
            borderRadius: '999px',
            fontSize: '0.8rem',
            fontWeight: 700,
            color: flag.enabled ? '#155724' : '#721c24',
            background: flag.enabled ? '#d4edda' : '#f8d7da',
            border: `1px solid ${flag.enabled ? '#b7dfc5' : '#f1b0b7'}`,
          }}
        >
          {flag.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={isPending || flag.enabled}
          onClick={() => handleToggle(true)}
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            border: 'none',
            background: '#111111',
            color: '#ffffff',
            fontWeight: 700,
            cursor: isPending || flag.enabled ? 'not-allowed' : 'pointer',
            opacity: isPending || flag.enabled ? 0.6 : 1,
          }}
        >
          Enable
        </button>
        <button
          type="button"
          disabled={isPending || !flag.enabled}
          onClick={() => handleToggle(false)}
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid #cfcfcf',
            background: '#ffffff',
            color: '#111111',
            fontWeight: 700,
            cursor: isPending || !flag.enabled ? 'not-allowed' : 'pointer',
            opacity: isPending || !flag.enabled ? 0.6 : 1,
          }}
        >
          Disable
        </button>
      </div>

      {flag.updated_at ? (
        <div style={{ fontSize: '0.85rem', color: '#666' }}>
          Last updated {new Date(flag.updated_at).toLocaleString()}
          {flag.updated_by_email ? ` by ${flag.updated_by_email}` : ''}
        </div>
      ) : null}
    </div>
  );
}
