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
    label: "下書きのみ作成",
    shortLabel: "下書きのみ",
    description: "投稿文の下書きだけ作成し、自動投稿しません。",
  },
  {
    level: "approve_then_run",
    icon: "👀",
    label: "実行前に確認",
    shortLabel: "実行前確認",
    description: "実行する前に、内容を確認します。",
  },
  {
    level: "full_auto",
    icon: "▶",
    label: "自動で実行",
    shortLabel: "自動実行",
    description: "予定の時刻に、確認なしで実行します。",
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
