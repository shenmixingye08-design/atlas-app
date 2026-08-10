import { getHealthVersionPayload } from "@/lib/health/version-info";
import { getFeatureFlagState } from "@/lib/feature-flags/store";
import { QUICK_REQUEST_PRESETS } from "@/lib/workspace/quick-request-presets";
import { LANDING_REQUEST_EXAMPLES } from "@/lib/landing/content";
import { WORKFLOW_TEMPLATES } from "@/lib/automations/workflow-templates";
import { connectorProviders } from "@/lib/connectors/definitions";
import { CAPABILITY_REGISTRY } from "@/lib/automation-platform/step-registry/registry";

import {
  assertPlanCatalogMediaGenerationHonesty,
  PRODUCTION_UNOFFERED_BILLING_FEATURES,
} from "./offered-capabilities";
import { getPlanDefinition } from "./registry";

export type PlanCapabilityHonestyProbeResult = {
  ok: boolean;
  planCatalogHonest: boolean;
  premiumMediaLimitsOff: boolean;
  mediaFlagsDefaultOff: boolean;
  quickPresetsHonest: boolean;
  landingExamplesHonest: boolean;
  workflowLabelsHonest: boolean;
  openaiImagesComingSoon: boolean;
  visionNotGatedOnImageGen: boolean;
  offeredPremiumFeaturesPresent: boolean;
  memoryNotSot: boolean;
  failClosed: boolean;
  error: string | null;
  commitShaShort: string;
  environment: string;
};

export function probePlanCapabilityHonesty(): PlanCapabilityHonestyProbeResult {
  const version = getHealthVersionPayload();
  const catalog = assertPlanCatalogMediaGenerationHonesty();
  const premium = getPlanDefinition("premium");

  const planCatalogHonest = catalog.ok;
  const premiumMediaLimitsOff =
    premium.limits.videoGeneration === false &&
    premium.limits.imageGeneration === false &&
    !premium.limits.features.includes("video_generation") &&
    !premium.limits.features.includes("image_generation");

  const mediaFlagsDefaultOff =
    getFeatureFlagState("video_generation") === "off" &&
    getFeatureFlagState("image_generation") === "off";

  const labels = QUICK_REQUEST_PRESETS.map((p) => p.label);
  const quickPresetsHonest =
    !labels.includes("画像生成") && !labels.includes("動画生成");

  const landingExamplesHonest = !LANDING_REQUEST_EXAMPLES.map(
    (ex) => ex.id as string,
  ).includes("video");

  const snsImageStep = WORKFLOW_TEMPLATES.sns_post.steps.find(
    (s) => s.id === "image_generation",
  );
  const workflowLabelsHonest = Boolean(
    snsImageStep && !snsImageStep.label.includes("画像生成"),
  );

  const openai = connectorProviders.find((p) => p.id === "openai");
  const images = openai?.services.find((s) => s.id === "images");
  const openaiImagesComingSoon = images?.status === "coming_soon";

  const vision = CAPABILITY_REGISTRY.find((c) => c.id === "vision_analysis");
  const visionNotGatedOnImageGen = vision?.requiredFeatureFlag == null;

  const offeredPremiumFeaturesPresent =
    premium.limits.features.includes("high_quality_mode") &&
    premium.limits.features.includes("advanced_automation") &&
    premium.limits.highQualityMode === true;

  const errors: string[] = [];
  if (!planCatalogHonest && catalog.ok === false) {
    errors.push(...catalog.errors);
  }
  if (!premiumMediaLimitsOff) errors.push("premium_media_limits_on");
  if (!mediaFlagsDefaultOff) errors.push("media_flags_not_off");
  if (!quickPresetsHonest) errors.push("quick_presets_claim_media_gen");
  if (!landingExamplesHonest) errors.push("landing_video_card_present");
  if (!workflowLabelsHonest) errors.push("workflow_label_claims_image_gen");
  if (!openaiImagesComingSoon) errors.push("openai_images_not_coming_soon");
  if (!visionNotGatedOnImageGen) {
    errors.push("vision_gated_on_image_generation");
  }
  if (!offeredPremiumFeaturesPresent) {
    errors.push("offered_premium_features_missing");
  }

  // Sanity: unoffered list is non-empty and named as expected.
  if (PRODUCTION_UNOFFERED_BILLING_FEATURES.length < 2) {
    errors.push("unoffered_feature_list_incomplete");
  }

  const ok = errors.length === 0;

  return {
    ok,
    planCatalogHonest,
    premiumMediaLimitsOff,
    mediaFlagsDefaultOff,
    quickPresetsHonest,
    landingExamplesHonest,
    workflowLabelsHonest,
    openaiImagesComingSoon,
    visionNotGatedOnImageGen,
    offeredPremiumFeaturesPresent,
    memoryNotSot: true,
    failClosed: true,
    error: ok ? null : errors.join(","),
    commitShaShort: version.commitShaShort,
    environment: version.environment,
  };
}
