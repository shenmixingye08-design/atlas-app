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
    label: "投稿前に確認",
    shortLabel: "投稿前確認",
    description: "投稿文を用意したあと、投稿前に必ず確認します。",
  },
  {
    level: "full_auto",
    icon: "▶",
    label: "完全自動投稿",
    shortLabel: "完全自動",
    description: "指定時刻に生成し、確認なしで投稿まで実行します。",
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
