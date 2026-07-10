import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import { resolveOrchestrationFeatureFlag } from "@/lib/feature-flags/guards";
import type { WorkflowTemplateId } from "@/lib/automations/types";

import { recordPopularityUsage } from "./store";
import type { PopularityFeatureId } from "./types";

const DELIVERABLE_TYPE_MAP: Partial<Record<DeliverableType, PopularityFeatureId>> =
  {
    blog: "blog",
    email: "email",
    social_post: "sns",
    presentation: "sales_material",
    proposal: "sales_material",
  };

const WORKFLOW_TEMPLATE_MAP: Partial<
  Record<WorkflowTemplateId, PopularityFeatureId>
> = {
  sns_post: "sns",
  blog: "blog",
  sales_material: "sales_material",
  video: "video",
};

export function mapDeliverableTypeToPopularityFeature(
  type: DeliverableType,
): PopularityFeatureId | null {
  return DELIVERABLE_TYPE_MAP[type] ?? null;
}

export function mapWorkflowTemplateToPopularityFeature(
  templateId: WorkflowTemplateId,
): PopularityFeatureId | null {
  return WORKFLOW_TEMPLATE_MAP[templateId] ?? null;
}

export function mapOrchestrationToPopularityFeature(input: {
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
  deliverableType?: DeliverableType;
}): PopularityFeatureId | null {
  if (input.deliverableType) {
    const mapped = mapDeliverableTypeToPopularityFeature(input.deliverableType);
    if (mapped) return mapped;
  }

  const flagId = resolveOrchestrationFeatureFlag(input);
  switch (flagId) {
    case "sns":
      return "sns";
    case "blog":
      return "blog";
    case "sales_material":
      return "sales_material";
    case "video_generation":
      return "video";
    case "image_generation":
      return "image";
    default:
      return null;
  }
}

export function recordPopularityFromOrchestration(input: {
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
  deliverableType?: DeliverableType;
  userId?: string | null;
}): void {
  const featureId = mapOrchestrationToPopularityFeature(input);
  if (!featureId) return;

  recordPopularityUsage({
    featureId,
    userId: input.userId ?? null,
  });
}

export function recordPopularityFromWorkflowTemplate(input: {
  templateId: WorkflowTemplateId;
  userId?: string | null;
}): void {
  const featureId = mapWorkflowTemplateToPopularityFeature(input.templateId);
  if (!featureId) return;

  recordPopularityUsage({
    featureId,
    userId: input.userId ?? null,
  });
}

export function recordGoogleIntegrationUsage(userId?: string | null): void {
  recordPopularityUsage({ featureId: "google", userId: userId ?? null });
}

export function recordDropboxIntegrationUsage(userId?: string | null): void {
  recordPopularityUsage({ featureId: "dropbox", userId: userId ?? null });
}
