import type { BillingFeatureId, PlanDefinition, PlanId } from "./types";
import { listPlanDefinitions } from "./registry";

/**
 * N-01: Billing feature ids that exist in the type system for fail-closed
 * routing, but are NOT offered on any Production plan and must never appear
 * as currently-available Premium capabilities.
 */
export const PRODUCTION_UNOFFERED_BILLING_FEATURES = [
  "video_generation",
  "image_generation",
] as const satisfies readonly BillingFeatureId[];

export type ProductionUnofferedBillingFeature =
  (typeof PRODUCTION_UNOFFERED_BILLING_FEATURES)[number];

/** User-visible strings that must not claim media generation is available. */
export const FORBIDDEN_MEDIA_GENERATION_CLAIM_PATTERNS = [
  "画像生成",
  "動画生成",
  "image generation",
  "video generation",
  "generate image",
  "generate video",
] as const;

export function isBillingFeatureOfferedOnAnyPlan(
  feature: BillingFeatureId,
  plans: readonly PlanDefinition[] = listPlanDefinitions(),
): boolean {
  return plans.some((plan) => plan.limits.features.includes(feature));
}

export function isProductionUnofferedBillingFeature(
  feature: BillingFeatureId,
): feature is ProductionUnofferedBillingFeature {
  return (PRODUCTION_UNOFFERED_BILLING_FEATURES as readonly string[]).includes(
    feature,
  );
}

/**
 * Lowest plan that includes the feature, or null when no plan offers it.
 * Never invents "premium unlocks this" for unoffered capabilities.
 */
export function resolveMinimumOfferedPlanForFeature(
  feature: BillingFeatureId,
  plans: readonly PlanDefinition[] = listPlanDefinitions(),
): PlanId | null {
  for (const plan of plans) {
    if (plan.limits.features.includes(feature)) {
      return plan.planId;
    }
  }
  return null;
}

export function planClaimsForbiddenMediaGeneration(
  plan: PlanDefinition,
): string[] {
  const haystacks = [
    plan.name,
    plan.description,
    ...plan.highlights,
    ...plan.limits.features,
  ].map((value) => String(value).toLowerCase());

  const hits: string[] = [];
  for (const pattern of FORBIDDEN_MEDIA_GENERATION_CLAIM_PATTERNS) {
    const needle = pattern.toLowerCase();
    if (haystacks.some((text) => text.includes(needle))) {
      hits.push(pattern);
    }
  }
  return hits;
}

export function assertPlanCatalogMediaGenerationHonesty(
  plans: readonly PlanDefinition[] = listPlanDefinitions(),
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  for (const feature of PRODUCTION_UNOFFERED_BILLING_FEATURES) {
    if (isBillingFeatureOfferedOnAnyPlan(feature, plans)) {
      errors.push(
        `billing_feature_offered_but_unimplemented:${feature}`,
      );
    }
  }

  for (const plan of plans) {
    if (plan.limits.videoGeneration) {
      errors.push(`plan_limit_videoGeneration_true:${plan.planId}`);
    }
    if (plan.limits.imageGeneration) {
      errors.push(`plan_limit_imageGeneration_true:${plan.planId}`);
    }
    const claims = planClaimsForbiddenMediaGeneration(plan);
    for (const claim of claims) {
      errors.push(`plan_user_visible_claim:${plan.planId}:${claim}`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
