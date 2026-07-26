import type { OrchestrationStep } from "@/lib/orchestration/types";

import type { UserProgressKind, UserProgressStepDef } from "./types";

const SALES_STEPS: readonly UserProgressStepDef[] = [
  {
    id: "organize",
    label: "内容を整理",
    activeLabel: "🧠 内容を整理しています…",
    icon: "🧠",
  },
  {
    id: "create",
    label: "営業資料を作成",
    activeLabel: "📑 営業資料を作成しています…",
    icon: "📑",
  },
  {
    id: "polish",
    label: "最終調整",
    activeLabel: "✨ 最終調整しています…",
    icon: "✨",
  },
  {
    id: "file",
    label: "Wordファイルを作成",
    activeLabel: "📄 Wordファイルを作成しています…",
    icon: "📄",
  },
  {
    id: "done",
    label: "完成",
    activeLabel: "✅ 完成しました",
    icon: "✅",
  },
];

const BLOG_STEPS: readonly UserProgressStepDef[] = [
  {
    id: "organize",
    label: "テーマを整理",
    activeLabel: "🧠 テーマを整理しています…",
    icon: "🧠",
  },
  {
    id: "create",
    label: "記事を執筆",
    activeLabel: "✍️ 記事を執筆しています…",
    icon: "✍️",
  },
  {
    id: "polish",
    label: "読みやすく調整",
    activeLabel: "✨ 読みやすく調整しています…",
    icon: "✨",
  },
  {
    id: "file",
    label: "公開用データを作成",
    activeLabel: "📰 公開用データを作成しています…",
    icon: "📰",
  },
  {
    id: "done",
    label: "完成",
    activeLabel: "✅ 完成しました",
    icon: "✅",
  },
];

const RECEIPT_STEPS: readonly UserProgressStepDef[] = [
  {
    id: "organize",
    label: "画像を確認",
    activeLabel: "🖼️ 画像を確認しています…",
    icon: "🖼️",
  },
  {
    id: "create",
    label: "レシートを読み取り",
    activeLabel: "🧾 レシートを読み取っています…",
    icon: "🧾",
  },
  {
    id: "polish",
    label: "内容を確認",
    activeLabel: "✨ 内容を確認しています…",
    icon: "✨",
  },
  {
    id: "file",
    label: "家計簿を作成",
    activeLabel: "📒 家計簿を作成しています…",
    icon: "📒",
  },
  {
    id: "done",
    label: "完成",
    activeLabel: "✅ 完成しました",
    icon: "✅",
  },
];

const EXCEL_STEPS: readonly UserProgressStepDef[] = [
  {
    id: "organize",
    label: "データを整理",
    activeLabel: "🧠 データを整理しています…",
    icon: "🧠",
  },
  {
    id: "create",
    label: "Excelを作成",
    activeLabel: "📊 Excelを作成しています…",
    icon: "📊",
  },
  {
    id: "polish",
    label: "表を最適化",
    activeLabel: "✨ 表を最適化しています…",
    icon: "✨",
  },
  {
    id: "file",
    label: "ファイルを仕上げ",
    activeLabel: "📄 ファイルを仕上げています…",
    icon: "📄",
  },
  {
    id: "done",
    label: "完成",
    activeLabel: "✅ 完成しました",
    icon: "✅",
  },
];

const PDF_STEPS: readonly UserProgressStepDef[] = [
  {
    id: "organize",
    label: "レイアウトを作成",
    activeLabel: "🧠 レイアウトを作成しています…",
    icon: "🧠",
  },
  {
    id: "create",
    label: "PDFを生成",
    activeLabel: "📑 PDFを生成しています…",
    icon: "📑",
  },
  {
    id: "polish",
    label: "最終調整",
    activeLabel: "✨ 最終調整しています…",
    icon: "✨",
  },
  {
    id: "file",
    label: "ファイルを出力",
    activeLabel: "📄 ファイルを出力しています…",
    icon: "📄",
  },
  {
    id: "done",
    label: "完成",
    activeLabel: "✅ 完成しました",
    icon: "✅",
  },
];

const SNS_STEPS: readonly UserProgressStepDef[] = [
  {
    id: "organize",
    label: "投稿内容を検討",
    activeLabel: "🧠 投稿内容を考えています…",
    icon: "🧠",
  },
  {
    id: "create",
    label: "投稿文を作成",
    activeLabel: "✍️ 投稿文を作成しています…",
    icon: "✍️",
  },
  {
    id: "polish",
    label: "投稿準備",
    activeLabel: "✨ 投稿準備をしています…",
    icon: "✨",
  },
  {
    id: "file",
    label: "仕上げ",
    activeLabel: "✨ 品質を向上しています…",
    icon: "✨",
  },
  {
    id: "done",
    label: "完成",
    activeLabel: "✅ 完成しました",
    icon: "✅",
  },
];

const GENERIC_STEPS: readonly UserProgressStepDef[] = [
  {
    id: "organize",
    label: "内容を整理",
    activeLabel: "🧠 内容を整理しています…",
    icon: "🧠",
  },
  {
    id: "create",
    label: "成果物を作成",
    activeLabel: "📑 成果物を作成しています…",
    icon: "📑",
  },
  {
    id: "polish",
    label: "最終調整",
    activeLabel: "✨ 最終調整しています…",
    icon: "✨",
  },
  {
    id: "file",
    label: "ファイルを準備",
    activeLabel: "📄 ファイルを準備しています…",
    icon: "📄",
  },
  {
    id: "done",
    label: "完成",
    activeLabel: "✅ 完成しました",
    icon: "✅",
  },
];

const STEPS_BY_KIND: Record<UserProgressKind, readonly UserProgressStepDef[]> = {
  sales_material: SALES_STEPS,
  blog: BLOG_STEPS,
  receipt: RECEIPT_STEPS,
  excel: EXCEL_STEPS,
  pdf: PDF_STEPS,
  sns: SNS_STEPS,
  generic: GENERIC_STEPS,
};

export function getUserProgressSteps(
  kind: UserProgressKind,
): readonly UserProgressStepDef[] {
  return STEPS_BY_KIND[kind];
}

/**
 * Map internal orchestration step → user step index (0..3 for orch phases).
 * Reviewer / Quality Engine / regenerations all collapse to "polish".
 * File step (index 3) is driven by client deliverable generation, not orch.
 */
export function orchestrationStepToUserIndex(
  step: OrchestrationStep | null | undefined,
): number {
  if (!step) return 0;
  switch (step) {
    case "ceo":
    case "research_assessment":
    case "research_report":
    case "planner_plan":
    case "planner_tasks":
      return 0;
    case "worker":
      return 1;
    case "reviewer":
    case "quality_assurance":
    case "ceo_approval":
    case "final_deliverable":
      return 2;
    default:
      return 0;
  }
}

/** File-generation step index (always second-to-last before done). */
export function fileStepIndex(kind: UserProgressKind): number {
  return getUserProgressSteps(kind).length - 2;
}

export function doneStepIndex(kind: UserProgressKind): number {
  return getUserProgressSteps(kind).length - 1;
}
