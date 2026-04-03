import { supabaseAdmin } from '@/lib/supabase-admin';

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

type ResolveClipPriceInput = {
  clipId: string;
  clubId: string | null;
  courtId: string | null;
  fallbackPriceCents: number | null;
};

export type ResolvedClipPrice = {
  priceCents: number;
  source: 'court_rule' | 'club_rule' | 'global_rule' | 'clip_fallback';
  pricingMode: 'free' | 'fixed' | 'fallback';
  ruleId: string | null;
  ruleName: string | null;
};

function normalizeFallbackPrice(value: number | null | undefined) {
  if (typeof value === 'number' && !Number.isNaN(value) && value >= 0) {
    return Math.round(value);
  }

  return 0;
}

export async function resolveClipPrice({
  clipId,
  clubId,
  courtId,
  fallbackPriceCents,
}: ResolveClipPriceInput): Promise<ResolvedClipPrice> {
  const { data: rules, error } = await supabaseAdmin
    .from('pricing_rules')
    .select(
      'id, rule_name, rule_level, club_id, court_id, is_active, pricing_mode, fixed_price_cents, min_price_cents, max_price_cents, created_at'
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error || !rules) {
    return {
      priceCents: normalizeFallbackPrice(fallbackPriceCents),
      source: 'clip_fallback',
      pricingMode: 'fallback',
      ruleId: null,
      ruleName: null,
    };
  }

  const pricingRules = rules as PricingRuleRow[];

  const courtRule =
    courtId
      ? pricingRules.find(
          (rule) =>
            rule.rule_level === 'court' &&
            rule.court_id === courtId &&
            rule.is_active
        ) ?? null
      : null;

  if (courtRule) {
    if (courtRule.pricing_mode === 'free') {
      return {
        priceCents: 0,
        source: 'court_rule',
        pricingMode: 'free',
        ruleId: courtRule.id,
        ruleName: courtRule.rule_name,
      };
    }

    if (
      courtRule.pricing_mode === 'fixed' &&
      typeof courtRule.fixed_price_cents === 'number'
    ) {
      return {
        priceCents: courtRule.fixed_price_cents,
        source: 'court_rule',
        pricingMode: 'fixed',
        ruleId: courtRule.id,
        ruleName: courtRule.rule_name,
      };
    }
  }

  const clubRule =
    clubId
      ? pricingRules.find(
          (rule) =>
            rule.rule_level === 'club' &&
            rule.club_id === clubId &&
            rule.is_active
        ) ?? null
      : null;

  if (clubRule) {
    if (clubRule.pricing_mode === 'free') {
      return {
        priceCents: 0,
        source: 'club_rule',
        pricingMode: 'free',
        ruleId: clubRule.id,
        ruleName: clubRule.rule_name,
      };
    }

    if (
      clubRule.pricing_mode === 'fixed' &&
      typeof clubRule.fixed_price_cents === 'number'
    ) {
      return {
        priceCents: clubRule.fixed_price_cents,
        source: 'club_rule',
        pricingMode: 'fixed',
        ruleId: clubRule.id,
        ruleName: clubRule.rule_name,
      };
    }
  }

  const globalRule =
    pricingRules.find(
      (rule) => rule.rule_level === 'global' && rule.is_active
    ) ?? null;

  if (globalRule) {
    if (globalRule.pricing_mode === 'free') {
      return {
        priceCents: 0,
        source: 'global_rule',
        pricingMode: 'free',
        ruleId: globalRule.id,
        ruleName: globalRule.rule_name,
      };
    }

    if (
      globalRule.pricing_mode === 'fixed' &&
      typeof globalRule.fixed_price_cents === 'number'
    ) {
      return {
        priceCents: globalRule.fixed_price_cents,
        source: 'global_rule',
        pricingMode: 'fixed',
        ruleId: globalRule.id,
        ruleName: globalRule.rule_name,
      };
    }
  }

  return {
    priceCents: normalizeFallbackPrice(fallbackPriceCents),
    source: 'clip_fallback',
    pricingMode: 'fallback',
    ruleId: null,
    ruleName: null,
  };
}

export async function resolvePricesForClips<
  T extends {
    id: string;
    club_id: string | null;
    court_id: string | null;
    price_cents: number | null;
  }
>(clips: T[]) {
  const resolved = await Promise.all(
    clips.map(async (clip) => {
      const pricing = await resolveClipPrice({
        clipId: clip.id,
        clubId: clip.club_id,
        courtId: clip.court_id,
        fallbackPriceCents: clip.price_cents,
      });

      return {
        ...clip,
        resolved_price_cents: pricing.priceCents,
        resolved_pricing_mode: pricing.pricingMode,
        resolved_price_source: pricing.source,
        resolved_rule_id: pricing.ruleId,
        resolved_rule_name: pricing.ruleName,
      };
    })
  );

  return resolved;
}