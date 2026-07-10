import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import type { WorkflowTemplateId } from "@/lib/automations/types";
import {
  mapOrchestrationToPopularityFeature,
  mapWorkflowTemplateToPopularityFeature,
} from "@/lib/owner/popularity-ranking/telemetry";

import { recordCostUsage } from "./store";
import type { CostUsageEventSource } from "./types";

export function recordCostFromOrchestration(input: {
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
  deliverableType?: DeliverableType;
  userId?: string | null;
  costUsd: number;
  durationMs: number;
  source?: CostUsageEventSource;
}): void {
  const featureId = mapOrchestrationToPopularityFeature(input);
  if (!featureId) return;

  recordCostUsage({
    featureId,
    userId: input.userId ?? null,
    costUsd: input.costUsd,
    durationMs: input.durationMs,
    source: input.source ?? "orchestration",
  });
}

export function recordCostFromWorkflowTemplate(input: {
  templateId: WorkflowTemplateId;
  userId?: string | null;
  costUsd: number;
  durationMs: number;
}): void {
  const featureId = mapWorkflowTemplateToPopularityFeature(input.templateId);
  if (!featureId) return;

  recordCostUsage({
    featureId,
    userId: input.userId ?? null,
    costUsd: input.costUsd,
    durationMs: input.durationMs,
    source: "automation",
  });
}
