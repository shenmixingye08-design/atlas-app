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
    label: "文章だけお願いする",
    shortLabel: "📝 文章だけ",
    description: "AIが文章や資料のみ作成します。",
  },
  {
    level: "draft_save",
    icon: "💾",
    label: "準備までお願いする",
    shortLabel: "💾 準備まで",
    description: "文章を作成し、下書きや保存まで行います。",
  },
  {
    level: "approve_then_run",
    icon: "👀",
    label: "確認後にお願いする",
    shortLabel: "👀 確認後",
    description:
      "ATLASが準備し、ユーザーが確認した後に投稿・送信・保存します。",
  },
  {
    level: "full_auto",
    icon: "🤖",
    label: "最後までお願いする",
    shortLabel: "🤖 最後まで",
    description:
      "ATLASが作成から投稿・送信・保存まで全て自動で実行します。",
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
