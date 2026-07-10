import { isBlogRelatedRequest } from "@/lib/orchestration/deliverable-types";
import type { ExternalServiceId } from "@/lib/integrations/external-services/types";
import type { WorkflowTemplateId } from "@/lib/automations/types";
import { isSalesMaterialRequest } from "@/lib/workspace/sales-material/detect";

import { isFeatureEnabled } from "./access";
import type { FeatureAccessContext, FeatureAvailabilityMap, FeatureFlagId } from "./types";

const EXTERNAL_SERVICE_FLAG_MAP: Partial<
  Record<ExternalServiceId, FeatureFlagId>
> = {
  google: "google",
  x: "x",
  wordpress: "wordpress",
  dropbox: "dropbox",
};

const WORKFLOW_TEMPLATE_FLAG_MAP: Partial<
  Record<WorkflowTemplateId, FeatureFlagId>
> = {
  sns_post: "sns",
  blog: "blog",
  sales_material: "sales_material",
  video: "video_generation",
};

const SNS_KEYWORDS = [
  "sns",
  "ツイート",
  "tweet",
  "x投稿",
  "instagram",
  "インスタ",
  "facebook",
  "linkedin",
  "ソーシャル",
] as const;

const VIDEO_KEYWORDS = [
  "動画",
  "video",
  "youtube",
  "ユーチューブ",
  "ショート",
] as const;

const IMAGE_KEYWORDS = [
  "画像生成",
  "image generation",
  "アイキャッチ",
  "サムネ",
  "thumbnail",
  "イラスト生成",
] as const;

function includesKeyword(haystack: string, keywords: readonly string[]): boolean {
  const normalized = haystack.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

export function getExternalServiceFeatureFlag(
  serviceId: ExternalServiceId,
): FeatureFlagId | null {
  return EXTERNAL_SERVICE_FLAG_MAP[serviceId] ?? null;
}

export function isExternalServiceFeatureEnabled(
  serviceId: ExternalServiceId,
  context: FeatureAccessContext,
): boolean {
  const flagId = getExternalServiceFeatureFlag(serviceId);
  if (!flagId) return true;
  return isFeatureEnabled(flagId, context);
}

export function getWorkflowTemplateFeatureFlag(
  templateId: WorkflowTemplateId,
): FeatureFlagId | null {
  return WORKFLOW_TEMPLATE_FLAG_MAP[templateId] ?? null;
}

export function isWorkflowTemplateFeatureEnabled(
  templateId: WorkflowTemplateId,
  context: FeatureAccessContext,
): boolean {
  const flagId = getWorkflowTemplateFeatureFlag(templateId);
  if (!flagId) return isFeatureEnabled("ai_employees", context);
  return isFeatureEnabled(flagId, context);
}

export function resolveOrchestrationFeatureFlag(input: {
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
}): FeatureFlagId {
  if (input.metadata?.salesMaterial) {
    return "sales_material";
  }

  if (isSalesMaterialRequest(input.assignment)) {
    return "sales_material";
  }

  if (includesKeyword(input.assignment, SNS_KEYWORDS)) {
    return "sns";
  }

  if (isBlogRelatedRequest(input.assignment)) {
    return "blog";
  }

  if (includesKeyword(input.assignment, VIDEO_KEYWORDS)) {
    return "video_generation";
  }

  if (includesKeyword(input.assignment, IMAGE_KEYWORDS)) {
    return "image_generation";
  }

  return "ai_employees";
}

export function isOrchestrationFeatureEnabled(
  input: {
    assignment: string;
    metadata?: Readonly<Record<string, unknown>>;
  },
  context: FeatureAccessContext,
): boolean {
  const flagId = resolveOrchestrationFeatureFlag(input);
  return isFeatureEnabled(flagId, context);
}

export function featureDisabledMessage(flagId: FeatureFlagId): string {
  switch (flagId) {
    case "google":
      return "Google連携は現在ご利用いただけません";
    case "x":
      return "X連携は現在ご利用いただけません";
    case "wordpress":
      return "WordPress連携は現在ご利用いただけません";
    case "dropbox":
      return "Dropbox連携は現在ご利用いただけません";
    case "video_generation":
      return "動画生成機能は現在ご利用いただけません";
    case "image_generation":
      return "画像生成機能は現在ご利用いただけません";
    case "sales_material":
      return "営業資料機能は現在ご利用いただけません";
    case "blog":
      return "ブログ機能は現在ご利用いただけません";
    case "sns":
      return "SNS機能は現在ご利用いただけません";
    case "ai_employees":
      return "AI秘書機能は現在ご利用いただけません";
    case "high_quality_mode":
      return "高品質モードは現在ご利用いただけません";
    default:
      return "この機能は現在ご利用いただけません";
  }
}

export function validateAutomationFeatureAccess(
  input: {
    executionMode?: string;
    executionFlow?: { templateId?: string };
  },
  context: FeatureAccessContext,
): string | null {
  if (
    input.executionMode === "high_quality" &&
    !isFeatureEnabled("high_quality_mode", context)
  ) {
    return featureDisabledMessage("high_quality_mode");
  }

  const templateId = input.executionFlow?.templateId;
  if (
    templateId &&
    !isWorkflowTemplateFeatureEnabled(
      templateId as WorkflowTemplateId,
      context,
    )
  ) {
    const flagId =
      getWorkflowTemplateFeatureFlag(templateId as WorkflowTemplateId) ??
      "ai_employees";
    return featureDisabledMessage(flagId);
  }

  return null;
}

export function isFeatureAvailableFromMap(
  id: FeatureFlagId,
  flags: FeatureAvailabilityMap,
): boolean {
  return flags[id] ?? true;
}

export function isWorkflowTemplateAvailableFromMap(
  templateId: WorkflowTemplateId,
  flags: FeatureAvailabilityMap,
): boolean {
  const flagId = getWorkflowTemplateFeatureFlag(templateId);
  if (!flagId) {
    return isFeatureAvailableFromMap("ai_employees", flags);
  }
  return isFeatureAvailableFromMap(flagId, flags);
}
