import type { DeliverableFormat } from "@/lib/deliverables/types";

import type { ArtifactDocument } from "./document";
import type { ArtifactSuggestion, ArtifactType } from "./types";

export type BuildArtifactSuggestionsInput = {
  artifactType: ArtifactType;
  assignment: string;
  content: string;
  generatedFormats: readonly DeliverableFormat[];
  hasWorkProfile?: boolean;
  excelRecommended?: boolean;
  excelNotApplicable?: boolean;
  document?: ArtifactDocument;
};

/**
 * Post-completion suggestions — rule-based, no LLM.
 */
export function buildArtifactSuggestions(
  input: BuildArtifactSuggestionsInput,
): ArtifactSuggestion[] {
  const generated = new Set(input.generatedFormats);
  const suggestions: ArtifactSuggestion[] = [];
  const doc = input.document;

  if (doc && doc.missingFields.length > 0) {
    suggestions.push({
      id: "suggest-quality-gaps",
      kind: "quality_gap",
      title: "この情報を登録すると、次回からより実用的な成果物を作れます",
      message: doc.missingFields.map((field) => field.label).slice(0, 6).join("・"),
      actionLabel: "成果物画面で入力",
      priority: 100,
      fieldKeys: doc.missingFields.map((field) => field.key),
    });
  }

  if (
    !generated.has("xlsx") &&
    input.excelRecommended &&
    !input.excelNotApplicable
  ) {
    suggestions.push({
      id: "suggest-excel",
      kind: "excel",
      title: "Excelでもご利用いただけます",
      message:
        "この成果物には表データが含まれています。Excel（.xlsx）でも生成できます。",
      actionLabel: "Excelを生成",
      priority: 90,
    });
  }

  if (input.excelNotApplicable && /excel|エクセル/.test(input.assignment)) {
    suggestions.push({
      id: "excel-not-applicable",
      kind: "excel",
      title: "Excel向けの構造ではありません",
      message:
        input.document?.excelNotApplicableReason ||
        "この成果物はExcel向けの構造ではありません",
      priority: 40,
    });
  }

  if (
    (input.artifactType === "sales_material" ||
      input.artifactType === "proposal" ||
      input.artifactType === "presentation") &&
    !generated.has("pptx") &&
    doc?.recommendedFormats.includes("pptx")
  ) {
    suggestions.push({
      id: "suggest-pptx",
      kind: "powerpoint",
      title: "PowerPoint向けレイアウトもご用意できます",
      message: "スライド形式での説明資料としてもご利用いただけます。",
      actionLabel: "PowerPointを確認",
      priority: 70,
    });
  }

  if (input.hasWorkProfile === false && !doc?.missingFields.length) {
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

  if (input.artifactType !== "sns" && input.artifactType !== "general") {
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

  return suggestions.sort((a, b) => b.priority - a.priority).slice(0, 5);
}
