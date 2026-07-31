import { readEffectiveCostSavingMode } from "@/lib/cost-optimization/metadata";
import type { DeliverableType } from "@/lib/orchestration/deliverable-types";

import type { QualityEngineTier, QualityPromptKind } from "./types";

/** Judge pass threshold for auto-improve (user requirement). */
export const QUALITY_JUDGE_PASS_SCORE = 90;

/** Max Writer improve rounds after Judge fails. */
export const QUALITY_ENGINE_MAX_IMPROVE = 2;

const LIGHT_TYPES: ReadonlySet<DeliverableType> = new Set([
  "email",
  "social_post",
  "short_document",
]);

const FULL_TYPES: ReadonlySet<DeliverableType> = new Set([
  "presentation",
  "proposal",
  "research",
  "report",
]);

/**
 * Resolve Quality Engine tier.
 * Light deliverables / eco mode stay on the fast path (no extra LLM).
 * Large / high-quality runs enable Reviewer + Judge + improve.
 */
export function resolveQualityEngineTier(input: {
  deliverableType: DeliverableType | string;
  metadata?: Readonly<Record<string, unknown>> | null;
  assignment?: string;
}): QualityEngineTier {
  const meta = input.metadata ?? {};
  if (meta.qualityEngineTier === "fast") return "fast";
  if (meta.qualityEngineTier === "enhanced") return "enhanced";
  if (meta.qualityEngineTier === "full") return "full";

  const costMode = readEffectiveCostSavingMode(
    meta as Readonly<Record<string, unknown>>,
  );
  const type = input.deliverableType as DeliverableType;
  const assignment = input.assignment ?? "";

  if (costMode === "low" || LIGHT_TYPES.has(type)) {
    return "fast";
  }

  if (
    costMode === "high" ||
    FULL_TYPES.has(type) ||
    /営業資料|提案書|契約|請求|プレゼン/i.test(assignment)
  ) {
    return "full";
  }

  return "enhanced";
}

/** Map assignment + deliverable type → dedicated prompt family. */
export function resolveQualityPromptKind(input: {
  assignment: string;
  deliverableType: DeliverableType | string;
  metadata?: Readonly<Record<string, unknown>> | null;
}): QualityPromptKind {
  const meta = input.metadata ?? {};
  const explicit = meta.qualityPromptKind;
  if (typeof explicit === "string") {
    const allowed: QualityPromptKind[] = [
      "sales_material",
      "contract",
      "invoice",
      "report",
      "proposal",
      "blog",
      "sns",
      "excel",
      "word",
      "pdf",
      "receipt",
      "generic",
    ];
    if (allowed.includes(explicit as QualityPromptKind)) {
      return explicit as QualityPromptKind;
    }
  }

  const a = input.assignment;
  if (/レシート|領収書|家計簿/i.test(a)) return "receipt";
  if (/契約書|NDA|秘密保持|利用規約/i.test(a)) return "contract";
  if (/請求書|invoice|見積書/i.test(a)) return "invoice";
  if (/sns|ツイート|投稿文|instagram|x投稿/i.test(a)) return "sns";
  if (/excel|エクセル|xlsx|表計算/i.test(a)) return "excel";
  if (/\bpdf\b|PDF/i.test(a) && !/営業|提案|プレゼン/i.test(a)) return "pdf";
  if (/word|ワード|docx|文書/i.test(a) && !/営業|提案|ブログ/i.test(a)) {
    return "word";
  }
  if (/営業資料|提案資料|スライド|プレゼン/i.test(a)) return "sales_material";
  if (/ブログ|blog|記事/i.test(a)) return "blog";
  if (/提案書|proposal/i.test(a)) return "proposal";
  if (/レポート|report|報告書/i.test(a)) return "report";

  switch (input.deliverableType) {
    case "presentation":
      return "sales_material";
    case "proposal":
      return "proposal";
    case "blog":
      return "blog";
    case "social_post":
      return "sns";
    case "report":
    case "research":
      return "report";
    default:
      return "generic";
  }
}

export function shouldRunLlmReviewer(tier: QualityEngineTier): boolean {
  return tier === "full" || tier === "enhanced";
}

export function shouldRunLlmJudge(tier: QualityEngineTier): boolean {
  return tier === "full";
}

export function maxImproveRounds(tier: QualityEngineTier): number {
  if (tier === "fast") return 0;
  if (tier === "enhanced") return 1;
  return QUALITY_ENGINE_MAX_IMPROVE;
}
