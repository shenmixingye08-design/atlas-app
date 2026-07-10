import type { SalesCostMode, SalesMaterialOutline } from "./types";

function defaultSections(): SalesMaterialOutline["sections"] {
  return [
    {
      heading: "表紙・自己紹介",
      keyMessage: "誰が、何のために話すのかを明確にする",
      visualCandidates: ["ロゴ", "担当者写真"],
    },
    {
      heading: "課題・背景",
      keyMessage: "顧客が抱える具体的な課題を共感ベースで提示",
      visualCandidates: ["課題整理図", "市場データ"],
    },
    {
      heading: "解決策・提案",
      keyMessage: "自社の強みと提案内容をシンプルに説明",
      visualCandidates: ["サービス概要図", "比較表"],
    },
    {
      heading: "実績・信頼",
      keyMessage: "導入事例や数字で信頼性を補強",
      visualCandidates: ["事例ロゴ", "KPIグラフ"],
    },
    {
      heading: "次のステップ",
      keyMessage: "具体的なアクション（商談・デモ・見積）を提示",
      visualCandidates: ["フロー図", "CTA"],
    },
  ];
}

export function buildFallbackSalesOutline(
  assignment: string,
  costMode: SalesCostMode,
): SalesMaterialOutline {
  const sections =
    costMode === "low"
      ? defaultSections().slice(0, 5)
      : costMode === "high"
        ? [
            ...defaultSections(),
            {
              heading: "競合比較",
              keyMessage: "差別化ポイントを整理",
              visualCandidates: ["比較マトリクス"],
            },
            {
              heading: "ROI・効果",
              keyMessage: "投資対効果を定量的に示す",
              visualCandidates: ["ROI試算表"],
            },
          ]
        : defaultSections();

  return {
    purpose: `依頼内容「${assignment.slice(0, 120)}」に基づく営業・提案資料`,
    targetAudience: "意思決定者および現場担当者",
    structure: sections.map((section) => section.heading),
    sections,
    notes:
      costMode === "low"
        ? "低コストモード: 画像生成なし・短めの構成です。"
        : costMode === "high"
          ? "高品質モード: 詳細な文章と図表候補を含みます（コスト高）。"
          : "標準モード: 必要最低限の図表候補を含みます。",
  };
}

export function formatOutlineForWorker(outline: SalesMaterialOutline): string {
  const lines = [
    `目的: ${outline.purpose}`,
    `想定ターゲット: ${outline.targetAudience}`,
    `全体構成: ${outline.structure.join(" → ")}`,
    "",
    "各セクション:",
    ...outline.sections.map(
      (section, index) =>
        `${index + 1}. ${section.heading}\n   主要メッセージ: ${section.keyMessage}\n   図表候補: ${section.visualCandidates.join("、") || "なし"}`,
    ),
  ];

  if (outline.notes.trim()) {
    lines.push("", `備考: ${outline.notes}`);
  }

  return lines.join("\n");
}
