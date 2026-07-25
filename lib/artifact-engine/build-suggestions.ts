import { contentHasMarkdownTable } from "@/lib/deliverables/excel-data";
import type { DeliverableFormat } from "@/lib/deliverables/types";

import type {
  ArtifactSuggestion,
  ArtifactType,
} from "./types";

export type BuildArtifactSuggestionsInput = {
  artifactType: ArtifactType;
  assignment: string;
  content: string;
  generatedFormats: readonly DeliverableFormat[];
  /** When false, suggest registering company / work profile. */
  hasWorkProfile?: boolean;
  excelRecommended?: boolean;
};

/**
 * Post-completion suggestions — rule-based, no LLM.
 * Surfaces Excel / learning / company-profile assists after a deliverable is ready.
 */
export function buildArtifactSuggestions(
  input: BuildArtifactSuggestionsInput,
): ArtifactSuggestion[] {
  const generated = new Set(input.generatedFormats);
  const suggestions: ArtifactSuggestion[] = [];
  const hasTable =
    input.excelRecommended || contentHasMarkdownTable(input.content);

  if (!generated.has("xlsx") && hasTable) {
    suggestions.push({
      id: "suggest-excel",
      kind: "excel",
      title: "Excelでもご利用いただけます",
      message:
        "この成果物には表データが含まれています。Excel（.xlsx）でも生成できます。生成しますか？",
      actionLabel: "Excelを生成",
      priority: 90,
    });
  }

  if (
    (input.artifactType === "sales_material" ||
      input.artifactType === "proposal" ||
      input.artifactType === "presentation") &&
    !generated.has("pptx")
  ) {
    suggestions.push({
      id: "suggest-pptx",
      kind: "powerpoint",
      title: "PowerPoint向けレイアウトもご用意できます",
      message:
        "営業・提案系の成果物です。スライド形式での出力にも対応しています。",
      actionLabel: "PowerPointを確認",
      priority: 70,
    });
  }

  if (input.hasWorkProfile === false) {
    suggestions.push({
      id: "suggest-company-profile",
      kind: "company_profile",
      title: "会社情報の登録で品質が向上します",
      message:
        "会社情報や仕事の好みを登録すると、次回から文書の体裁・用語・提案の精度が上がります。",
      actionLabel: "設定を開く",
      priority: 60,
    });
  }

  if (
    input.artifactType !== "sns" &&
    input.artifactType !== "general"
  ) {
    suggestions.push({
      id: "suggest-learning-template",
      kind: "learning_template",
      title: "この成果物の型を記憶できます",
      message:
        "同じ依頼を繰り返す場合、今回の構成をテンプレートとして覚えると次回の作業が減ります。",
      actionLabel: "学習へ連携",
      priority: 50,
    });
  }

  if (
    (input.artifactType === "report" ||
      input.artifactType === "proposal" ||
      input.artifactType === "plan" ||
      input.artifactType === "research") &&
    !/#\s*目次|table of contents/i.test(input.content)
  ) {
    suggestions.push({
      id: "suggest-toc",
      kind: "toc",
      title: "目次を自動付与しています",
      message:
        "Word / PDF には見出しから目次を自動生成しています。画面プレビューでも構成をご確認ください。",
      priority: 30,
    });
  }

  return suggestions.sort((a, b) => b.priority - a.priority).slice(0, 4);
}
