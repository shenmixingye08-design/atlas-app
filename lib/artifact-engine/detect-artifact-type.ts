import type { DocumentType } from "@/lib/deliverables/document-model";
import { detectDocumentType } from "@/lib/deliverables/document-model";

import {
  ARTIFACT_TYPE_LABELS,
  type ArtifactType,
} from "./types";

type Rule = {
  type: ArtifactType;
  weight: number;
  patterns: RegExp[];
};

/**
 * Keyword rules for artifact type detection.
 * Pure heuristics — no AI calls (cost-safe).
 */
const RULES: readonly Rule[] = [
  {
    type: "invoice",
    weight: 8,
    patterns: [/請求書/, /invoice/, /請求明細/, /御請求/, /請求一覧/],
  },
  {
    type: "estimate",
    weight: 8,
    patterns: [/見積書/, /お見積/, /見積もり/, /estimate/],
  },
  {
    type: "contract",
    weight: 8,
    patterns: [/契約書/, /contract/, /秘密保持/, /nda/, /利用規約/, / agreement/i],
  },
  {
    type: "youtube_script",
    weight: 8,
    patterns: [/youtube|ユーチューブ|台本|動画脚本|チャンネル登録/i],
  },
  {
    type: "ranking",
    weight: 7,
    patterns: [/ランキング/, /ranking/, /順位表/, /人気ランキング/, /トップ\s*\d+/, /人気の遊び/],
  },
  {
    type: "household",
    weight: 7,
    patterns: [/家計簿/, /家計/, /収支表/, /支出一覧/, /入出金/],
  },
  {
    type: "schedule",
    weight: 6,
    patterns: [/スケジュール/, /日程表/, /予定表/, /工程表/, /タイムテーブル/],
  },
  {
    type: "list",
    weight: 6,
    patterns: [
      /顧客一覧/,
      /住所一覧/,
      /在庫一覧/,
      /売上一覧/,
      /一覧表/,
      /名簿/,
      /リスト作成/,
    ],
  },
  {
    type: "sns",
    weight: 6,
    patterns: [/sns投稿/, /ツイート/, /x投稿/, /instagram/, /投稿文/, /キャプション/],
  },
  {
    type: "blog",
    weight: 5,
    patterns: [/ブログ/, /blog post/, /コラム/, /記事を書/],
  },
  {
    type: "presentation",
    weight: 5,
    patterns: [/パワーポイント/, /powerpoint/, /pptx/, /スライド資料/, /pitch deck/],
  },
  {
    type: "sales_material",
    weight: 6,
    patterns: [
      /営業資料/,
      /セールス資料/,
      /サービス紹介/,
      /sales deck/,
      /土地活用/,
      /投函/,
      /地主/,
    ],
  },
  {
    type: "minutes",
    weight: 6,
    patterns: [/議事録/, /meeting minutes/, /会議録/, /ミーティングメモ/, /会議の議事/],
  },
  {
    type: "manual",
    weight: 5,
    patterns: [/マニュアル/, /手順書/, /操作手順/, /ハウツー/],
  },
  {
    type: "research",
    weight: 5,
    patterns: [/調査レポート/, /調査報告/, /市場調査/, /ホワイトペーパー/, /調査資料/],
  },
  {
    type: "report",
    weight: 4,
    patterns: [/報告書/, /レポート/, /月次報告/, /週次報告/, /実績報告/],
  },
  {
    type: "plan",
    weight: 4,
    patterns: [/企画書/, /事業計画/, /実施計画/, /プロジェクト計画/],
  },
  {
    type: "proposal",
    weight: 4,
    patterns: [/提案書/, /ご提案/, /導入提案/, /ソリューション提案/],
  },
] as const;

const ARTIFACT_TO_DOCUMENT: Record<ArtifactType, DocumentType> = {
  sales_material: "sales",
  proposal: "proposal",
  plan: "plan",
  report: "report",
  contract: "general",
  invoice: "estimate",
  estimate: "estimate",
  minutes: "minutes",
  ranking: "estimate",
  list: "general",
  household: "estimate",
  schedule: "general",
  research: "research",
  manual: "manual",
  blog: "general",
  sns: "general",
  youtube_script: "general",
  presentation: "sales",
  general: "general",
};

function scoreRule(haystack: string, rule: Rule): number {
  let score = 0;
  for (const pattern of rule.patterns) {
    if (pattern.test(haystack)) score += rule.weight;
  }
  return score;
}

function fromDocumentType(documentType: DocumentType): ArtifactType {
  switch (documentType) {
    case "sales":
      return "sales_material";
    case "proposal":
      return "proposal";
    case "plan":
      return "plan";
    case "report":
      return "report";
    case "estimate":
      return "list";
    case "minutes":
      return "minutes";
    case "manual":
      return "manual";
    case "research":
      return "research";
    default:
      return "general";
  }
}

/**
 * Detect the best artifact type from assignment + content.
 * Rule-based only — never calls an LLM.
 */
export function detectArtifactType(input: {
  assignment: string;
  content?: string;
  title?: string;
}): { artifactType: ArtifactType; label: string; documentType: DocumentType } {
  const haystack = [input.assignment, input.title, input.content]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n")
    .toLowerCase()
    .slice(0, 12_000);

  let best: { type: ArtifactType; score: number } = {
    type: "general",
    score: 0,
  };

  for (const rule of RULES) {
    const score = scoreRule(haystack, rule);
    if (score > best.score) {
      best = { type: rule.type, score };
    }
  }

  if (best.score > 0) {
    return {
      artifactType: best.type,
      label: ARTIFACT_TYPE_LABELS[best.type],
      documentType: ARTIFACT_TO_DOCUMENT[best.type],
    };
  }

  const documentType = detectDocumentType({
    content: input.content ?? "",
    assignment: input.assignment,
    title: input.title,
  });
  const artifactType = fromDocumentType(documentType);

  return {
    artifactType,
    label: ARTIFACT_TYPE_LABELS[artifactType],
    documentType,
  };
}

export function artifactTypeToDocumentType(
  artifactType: ArtifactType,
): DocumentType {
  return ARTIFACT_TO_DOCUMENT[artifactType];
}
