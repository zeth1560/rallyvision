import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  isProductType,
  type ProductType,
} from '@/lib/commerce/products';

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

export type ResolvedProductPrice = {
  priceCents: number;
  source: 'court_rule' | 'club_rule' | 'global_rule' | 'fallback';
  pricingMode: 'free' | 'fixed' | 'fallback';
  ruleId: string | null;
  ruleName: string | null;
  productType: ProductType;
};

type ResolveProductPriceInput = {
  productType: ProductType;
  clubId: string | null;
  courtId: string | null;
  fallbackPriceCents?: number | null;
};

type ResolveClipPriceInput = {
  clipId: string;
  clubId: string | null;
  courtId: string | null;
  fallbackPriceCents: number | null;
  productType?: ProductType;
};

/** @deprecated Use ResolvedProductPrice */
export type ResolvedClipPrice = ResolvedProductPrice;

function normalizeFallbackPrice(value: number | null | undefined) {
  if (typeof value === 'number' && !Number.isNaN(value) && value >= 0) {
    return Math.round(value);
  }

  return 0;
}

function findMatchingRule(
  pricingRules: PricingRuleRow[],
  productType: ProductType,
  clubId: string | null,
  courtId: string | null
) {
  const productRules = pricingRules.filter(
    (rule) => (rule.product_type ?? 'clip_download') === productType
  );

  const courtRule =
    courtId
      ? productRules.find(
          (rule) =>
            rule.rule_level === 'court' &&
            rule.court_id === courtId &&
            rule.is_active
        ) ?? null
      : null;

  if (courtRule) {
    return { rule: courtRule, source: 'court_rule' as const };
  }

  const clubRule =
    clubId
      ? productRules.find(
          (rule) =>
            rule.rule_level === 'club' &&
            rule.club_id === clubId &&
            rule.is_active
        ) ?? null
      : null;

  if (clubRule) {
    return { rule: clubRule, source: 'club_rule' as const };
  }

  const globalRule =
    productRules.find(
      (rule) => rule.rule_level === 'global' && rule.is_active
    ) ?? null;

  if (globalRule) {
    return { rule: globalRule, source: 'global_rule' as const };
  }

  return { rule: null, source: 'fallback' as const };
}

function resolveRuleToPrice(
  rule: PricingRuleRow | null,
  source: ResolvedProductPrice['source'],
  productType: ProductType,
  fallbackPriceCents: number | null | undefined
): ResolvedProductPrice {
  if (!rule) {
    return {
      priceCents: normalizeFallbackPrice(fallbackPriceCents),
      source: 'fallback',
      pricingMode: 'fallback',
      ruleId: null,
      ruleName: null,
      productType,
    };
  }

  if (rule.pricing_mode === 'free') {
    return {
      priceCents: 0,
      source,
      pricingMode: 'free',
      ruleId: rule.id,
      ruleName: rule.rule_name,
      productType,
    };
  }

  if (rule.pricing_mode === 'fixed' && typeof rule.fixed_price_cents === 'number') {
    return {
      priceCents: rule.fixed_price_cents,
      source,
      pricingMode: 'fixed',
      ruleId: rule.id,
      ruleName: rule.rule_name,
      productType,
    };
  }

  return {
    priceCents: normalizeFallbackPrice(fallbackPriceCents),
    source: 'fallback',
    pricingMode: 'fallback',
    ruleId: null,
    ruleName: null,
    productType,
  };
}

export async function resolveProductPrice({
  productType,
  clubId,
  courtId,
  fallbackPriceCents = null,
}: ResolveProductPriceInput): Promise<ResolvedProductPrice> {
  if (!isProductType(productType)) {
    throw new Error(`Invalid product type: ${productType}`);
  }

  const { data: rules, error } = await supabaseAdmin
    .from('pricing_rules')
    .select(
      'id, rule_name, rule_level, club_id, court_id, is_active, pricing_mode, fixed_price_cents, min_price_cents, max_price_cents, product_type, created_at'
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error || !rules) {
    return resolveRuleToPrice(null, 'fallback', productType, fallbackPriceCents);
  }

  const { rule, source } = findMatchingRule(
    rules as PricingRuleRow[],
    productType,
    clubId,
    courtId
  );

  return resolveRuleToPrice(rule, source, productType, fallbackPriceCents);
}

export async function resolveClipPrice({
  clipId,
  clubId,
  courtId,
  fallbackPriceCents,
  productType = 'clip_download',
}: ResolveClipPriceInput): Promise<ResolvedProductPrice> {
  void clipId;

  return resolveProductPrice({
    productType,
    clubId,
    courtId,
    fallbackPriceCents,
  });
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
        resolved_product_type: pricing.productType,
      };
    })
  );

  return resolved;
}
