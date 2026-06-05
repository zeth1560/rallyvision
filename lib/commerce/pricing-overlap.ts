import type { ProductType } from '@/lib/commerce/products';

type PricingRuleOverlapRow = {
  id: string;
  rule_name: string | null;
  rule_level: string | null;
  club_id: string | null;
  court_id: string | null;
  is_active: boolean;
  product_type: string | null;
  created_at: string | null;
};

export type PricingRuleOverlapGroup = {
  key: string;
  productType: string;
  ruleLevel: string;
  clubId: string | null;
  courtId: string | null;
  rules: PricingRuleOverlapRow[];
};

function overlapGroupKey(rule: PricingRuleOverlapRow) {
  return [
    rule.product_type ?? 'clip_download',
    rule.rule_level ?? 'global',
    rule.club_id ?? '',
    rule.court_id ?? '',
  ].join(':');
}

export function findOverlappingActivePricingRules(
  rules: PricingRuleOverlapRow[]
): PricingRuleOverlapGroup[] {
  const activeRules = rules.filter((rule) => rule.is_active);
  const groups = new Map<string, PricingRuleOverlapRow[]>();

  for (const rule of activeRules) {
    const key = overlapGroupKey(rule);
    const existing = groups.get(key) ?? [];
    existing.push(rule);
    groups.set(key, existing);
  }

  return [...groups.entries()]
    .filter(([, groupRules]) => groupRules.length > 1)
    .map(([key, groupRules]) => {
      const sample = groupRules[0];

      return {
        key,
        productType: sample.product_type ?? 'clip_download',
        ruleLevel: sample.rule_level ?? 'global',
        clubId: sample.club_id,
        courtId: sample.court_id,
        rules: [...groupRules].sort((a, b) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bTime - aTime;
        }),
      };
    });
}

export function formatPricingOverlapTarget(
  group: PricingRuleOverlapGroup,
  clubNameById: Map<string, string>,
  courtLabelById: Map<string, string>
) {
  if (group.ruleLevel === 'court' && group.courtId) {
    return courtLabelById.get(group.courtId) ?? 'Unknown Court';
  }

  if (group.ruleLevel === 'club' && group.clubId) {
    return clubNameById.get(group.clubId) ?? 'Unknown Club';
  }

  return 'Global Default';
}
