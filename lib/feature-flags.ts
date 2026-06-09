import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  COACH_REVIEW_CUSTOMER_ENABLED,
  SESSION_COACH_REVIEW_ADDON_ENABLED,
  YOUTUBE_CUSTOMER_ENABLED,
} from '@/lib/commerce/products';

export const FEATURE_FLAG_KEYS = [
  'coach_review_customer',
  'session_coach_review_addon',
  'pb_vision_customer',
  'youtube_customer',
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export type FeatureFlagDefinition = {
  key: FeatureFlagKey;
  label: string;
  description: string;
  defaultEnabled: boolean;
};

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export type FeatureFlagRow = FeatureFlagDefinition & {
  enabled: boolean;
  updated_at: string | null;
  updated_by_email: string | null;
};

const FEATURE_FLAG_DEFINITIONS: FeatureFlagDefinition[] = [
  {
    key: 'coach_review_customer',
    label: 'Pro Review (PlayerTrove)',
    description:
      'Pro Review purchase, request flow, and upsell actions in PlayerTrove and success page.',
    defaultEnabled: COACH_REVIEW_CUSTOMER_ENABLED,
  },
  {
    key: 'session_coach_review_addon',
    label: 'Pro Review (session checkout)',
    description: 'Pro Review add-on checkbox on session checkout pages.',
    defaultEnabled: SESSION_COACH_REVIEW_ADDON_ENABLED,
  },
  {
    key: 'pb_vision_customer',
    label: 'PB Vision',
    description:
      'PB Vision purchase and analysis upsell across PlayerTrove, success page, and session checkout.',
    defaultEnabled: true,
  },
  {
    key: 'youtube_customer',
    label: 'YouTube',
    description: 'YouTube view buttons on PlayerTrove video cards.',
    defaultEnabled: YOUTUBE_CUSTOMER_ENABLED,
  },
];

function defaultFeatureFlags(): FeatureFlags {
  return FEATURE_FLAG_DEFINITIONS.reduce<FeatureFlags>((flags, definition) => {
    flags[definition.key] = definition.defaultEnabled;
    return flags;
  }, {} as FeatureFlags);
}

export function getFeatureFlagDefinitions() {
  return FEATURE_FLAG_DEFINITIONS;
}

export function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return FEATURE_FLAG_KEYS.includes(value as FeatureFlagKey);
}

export const getFeatureFlags = cache(async (): Promise<FeatureFlags> => {
  const flags = defaultFeatureFlags();

  const { data, error } = await supabaseAdmin
    .from('platform_feature_flags')
    .select('key, enabled')
    .in('key', [...FEATURE_FLAG_KEYS]);

  if (error) {
    console.error('[FeatureFlags] Failed to load flags, using defaults', {
      error: error.message,
    });
    return flags;
  }

  for (const row of data ?? []) {
    if (isFeatureFlagKey(row.key)) {
      flags[row.key] = Boolean(row.enabled);
    }
  }

  return flags;
});

export async function getFeatureFlagRowsForAdmin(): Promise<FeatureFlagRow[]> {
  const defaults = defaultFeatureFlags();
  const { data, error } = await supabaseAdmin
    .from('platform_feature_flags')
    .select('key, label, description, enabled, updated_at, updated_by_email')
    .in('key', [...FEATURE_FLAG_KEYS]);

  if (error) {
    throw new Error(`Failed to load feature flags: ${error.message}`);
  }

  const byKey = new Map((data ?? []).map((row) => [row.key, row]));

  return FEATURE_FLAG_DEFINITIONS.map((definition) => {
    const row = byKey.get(definition.key);
    return {
      ...definition,
      label: row?.label ?? definition.label,
      description: row?.description ?? definition.description,
      enabled: row ? Boolean(row.enabled) : defaults[definition.key],
      updated_at: row?.updated_at ?? null,
      updated_by_email: row?.updated_by_email ?? null,
    };
  });
}

export async function updateFeatureFlag({
  key,
  enabled,
  updatedByEmail,
}: {
  key: FeatureFlagKey;
  enabled: boolean;
  updatedByEmail: string;
}) {
  const definition = FEATURE_FLAG_DEFINITIONS.find((item) => item.key === key);
  if (!definition) {
    throw new Error(`Unknown feature flag: ${key}`);
  }

  const now = new Date().toISOString();

  const { error } = await supabaseAdmin.from('platform_feature_flags').upsert(
    {
      key,
      label: definition.label,
      description: definition.description,
      enabled,
      updated_at: now,
      updated_by_email: updatedByEmail,
    },
    { onConflict: 'key' }
  );

  if (error) {
    throw new Error(`Failed to update feature flag: ${error.message}`);
  }
}

export function isCustomerAddonEnabled(
  flags: FeatureFlags,
  product: 'pb_vision' | 'coach_review'
) {
  if (product === 'pb_vision') {
    return flags.pb_vision_customer;
  }

  return flags.coach_review_customer;
}

export function customerAddonDisabledMessage(product: 'pb_vision' | 'coach_review') {
  return product === 'pb_vision'
    ? 'PB Vision is temporarily unavailable.'
    : 'Pro Review is temporarily unavailable.';
}
