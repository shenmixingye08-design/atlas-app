import type { AutomationExecutionMode } from "./execution-mode";
import { executionModeToCostSavingMode, normalizeExecutionMode } from "./execution-mode";
import type { SnsBatchDays } from "./sns-batch";
import { normalizeSnsBatchDays } from "./sns-batch";

export type CostSavingMode = "low" | "standard" | "high";

export type CostOptimizationMetadata = {
  executionMode: AutomationExecutionMode;
  snsBatchDays: SnsBatchDays | null;
  preferCache: boolean;
  batchGeneration: boolean;
};

const METADATA_KEY = "costOptimization";

export function readCostOptimizationMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): CostOptimizationMetadata | null {
  const raw = metadata?.[METADATA_KEY];
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  return {
    executionMode: normalizeExecutionMode(
      record.executionMode as AutomationExecutionMode | undefined,
    ),
    snsBatchDays: normalizeSnsBatchDays(
      record.snsBatchDays as SnsBatchDays | null | undefined,
    ),
    preferCache: record.preferCache === true,
    batchGeneration: record.batchGeneration === true,
  };
}

export function readExecutionMode(
  metadata: Readonly<Record<string, unknown>> | undefined,
): AutomationExecutionMode {
  return (
    readCostOptimizationMetadata(metadata)?.executionMode ??
    normalizeExecutionMode(undefined)
  );
}

/** Combines sales-material wizard cost mode with automation execution mode. */
export function readEffectiveCostSavingMode(
  metadata: Readonly<Record<string, unknown>> | undefined,
): CostSavingMode {
  const salesRaw = metadata?.salesMaterial;
  if (salesRaw && typeof salesRaw === "object") {
    const costMode = (salesRaw as Record<string, unknown>).costMode;
    if (costMode === "low" || costMode === "standard" || costMode === "high") {
      return costMode;
    }
  }
  return executionModeToCostSavingMode(readExecutionMode(metadata));
}

export function buildCostOptimizationMetadata(params: {
  executionMode: AutomationExecutionMode;
  snsBatchDays?: SnsBatchDays | null;
}): Record<string, unknown> {
  const mode = normalizeExecutionMode(params.executionMode);
  const snsBatchDays = normalizeSnsBatchDays(params.snsBatchDays);

  return {
    [METADATA_KEY]: {
      executionMode: mode,
      snsBatchDays,
      preferCache: mode === "eco",
      batchGeneration: mode === "eco" && snsBatchDays !== null,
    } satisfies CostOptimizationMetadata,
  };
}
