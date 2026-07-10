/**
 * Execution mode controls how aggressively ATLAS optimizes AI usage per habit.
 * Stored per automation — does not change Planner/Deliverable/Workflow cores.
 */
export type AutomationExecutionMode = "eco" | "standard" | "high_quality";

export const DEFAULT_EXECUTION_MODE: AutomationExecutionMode = "eco";

export type ExecutionModeOption = {
  mode: AutomationExecutionMode;
  icon: string;
  label: string;
  shortLabel: string;
  description: string;
};

export const EXECUTION_MODE_OPTIONS: readonly ExecutionModeOption[] = [
  {
    mode: "eco",
    icon: "🟢",
    label: "エコモード（推奨）",
    shortLabel: "🟢 エコ",
    description:
      "同種の仕事をまとめて生成し、キャッシュと予約投稿を優先。必要な時だけAIを起動します。",
  },
  {
    mode: "standard",
    icon: "🔵",
    label: "標準モード",
    shortLabel: "🔵 標準",
    description: "通常通りAIを利用し、毎回内容を生成します。一般的な品質です。",
  },
  {
    mode: "high_quality",
    icon: "🟣",
    label: "高品質モード",
    shortLabel: "🟣 高品質",
    description:
      "毎回AIで新規生成し、最新情報を反映。必要に応じて外部連携も活用します。",
  },
] as const;

export function normalizeExecutionMode(
  mode: AutomationExecutionMode | undefined,
): AutomationExecutionMode {
  if (mode === "eco" || mode === "standard" || mode === "high_quality") {
    return mode;
  }
  return DEFAULT_EXECUTION_MODE;
}

export function getExecutionModeOption(
  mode: AutomationExecutionMode,
): ExecutionModeOption {
  return (
    EXECUTION_MODE_OPTIONS.find((option) => option.mode === mode) ??
    EXECUTION_MODE_OPTIONS[0]
  );
}

export function getExecutionModeShortLabel(
  mode: AutomationExecutionMode | undefined,
): string {
  return getExecutionModeOption(normalizeExecutionMode(mode)).shortLabel;
}

/** Maps execution mode to existing sales cost policy tier. */
export function executionModeToCostSavingMode(
  mode: AutomationExecutionMode,
): "low" | "standard" | "high" {
  switch (mode) {
    case "eco":
      return "low";
    case "high_quality":
      return "high";
    default:
      return "standard";
  }
}

export function shouldPreferCache(mode: AutomationExecutionMode): boolean {
  return mode === "eco";
}

export function shouldSkipRepeatedAiCalls(mode: AutomationExecutionMode): boolean {
  return mode === "eco";
}
