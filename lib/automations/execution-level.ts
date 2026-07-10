import type { AutomationExecutionLevel } from "./types";

export const DEFAULT_EXECUTION_LEVEL: AutomationExecutionLevel = "approve_then_run";

export type ExecutionLevelOption = {
  level: AutomationExecutionLevel;
  icon: string;
  label: string;
  shortLabel: string;
  description: string;
};

export const EXECUTION_LEVEL_OPTIONS: readonly ExecutionLevelOption[] = [
  {
    level: "suggest_only",
    icon: "📝",
    label: "作成前に確認",
    shortLabel: "作成前に確認",
    description: "内容を作る前に、方針を確認します。",
  },
  {
    level: "draft_save",
    icon: "💾",
    label: "作成後に確認",
    shortLabel: "作成後に確認",
    description: "下書きまで作成し、その後確認します。",
  },
  {
    level: "approve_then_run",
    icon: "👀",
    label: "最後の実行前に確認",
    shortLabel: "実行前に確認",
    description:
      "投稿・送信などの重要操作の前に、必ず確認します。",
  },
  {
    level: "full_auto",
    icon: "▶",
    label: "確認せず実行",
    shortLabel: "確認せず実行",
    description:
      "重要操作がない場合のみ、確認なしで進めます。",
  },
] as const;

export function normalizeExecutionLevel(
  level: AutomationExecutionLevel | undefined,
): AutomationExecutionLevel {
  if (
    level === "suggest_only" ||
    level === "draft_save" ||
    level === "approve_then_run" ||
    level === "full_auto"
  ) {
    return level;
  }
  return DEFAULT_EXECUTION_LEVEL;
}

export function getExecutionLevelOption(
  level: AutomationExecutionLevel,
): ExecutionLevelOption {
  return (
    EXECUTION_LEVEL_OPTIONS.find((option) => option.level === level) ??
    EXECUTION_LEVEL_OPTIONS[2]
  );
}

export function getExecutionLevelShortLabel(
  level: AutomationExecutionLevel | undefined,
): string {
  return getExecutionLevelOption(normalizeExecutionLevel(level)).shortLabel;
}

export function getExecutionLevelLabel(
  level: AutomationExecutionLevel | undefined,
): string {
  return getExecutionLevelOption(normalizeExecutionLevel(level)).label;
}
