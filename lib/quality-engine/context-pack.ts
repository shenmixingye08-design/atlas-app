import { resolveCompanyTemplateIdFromMetadata } from "@/lib/company-templates/context";
import type { KnowledgeRetrievalResult } from "@/lib/knowledge/types";

import {
  formatMergedKnowledgeForPrompt,
  mergeKnowledgeForWriter,
  type KnowledgeUsage,
  type MergedKnowledgePack,
} from "./knowledge";
import { resolveQualityPromptKind } from "./policy";
import {
  buildReferenceInsights,
  type ReferenceInsights,
} from "./reference-engine";
import type { QualityPromptKind } from "./types";

export type QualityContextPack = {
  businessProfileSummary: string;
  visionSummary: string;
  userSettingsSummary: string;
  pastDeliverableHints: string;
  templateId: string | null;
  templateHints: string;
  /** Reference Engine insights from attachments. */
  reference: ReferenceInsights;
  /** Deliverable kind used to select registry knowledge. */
  promptKind: QualityPromptKind;
  /** Knowledge Engine merged pack for Writer. */
  knowledgePack: MergedKnowledgePack;
  /** Owner/telemetry usage flags. */
  knowledgeUsage: KnowledgeUsage;
};

function asTrimmedString(value: unknown, max = 1_200): string {
  if (typeof value !== "string") return "";
  const t = value.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}\n[...truncated]` : t;
}

function readNestedString(
  obj: Readonly<Record<string, unknown>> | null | undefined,
  keys: readonly string[],
): string {
  if (!obj) return "";
  for (const key of keys) {
    const value = obj[key];
    const text = asTrimmedString(value, 1_500);
    if (text) return text;
  }
  return "";
}

/**
 * Assemble Writer Context Pack via Knowledge Engine (no LLM).
 * Merges Business Profile → Reference → 会社 → 業界 → 成果物 → Template …
 */
export function buildQualityContextPack(input: {
  assignment?: string;
  deliverableType?: string;
  metadata?: Readonly<Record<string, unknown>> | null;
  knowledge?: KnowledgeRetrievalResult | null;
  promptKind?: QualityPromptKind;
}): QualityContextPack {
  const meta = (input.metadata ?? {}) as Record<string, unknown>;
  const knowledge = input.knowledge ?? null;
  const reference = buildReferenceInsights(meta);
  const promptKind =
    input.promptKind ??
    resolveQualityPromptKind({
      assignment: input.assignment ?? "",
      deliverableType: input.deliverableType ?? "document",
      metadata: meta,
    });

  const businessProfileSummary =
    readNestedString(meta, [
      "businessProfileSummary",
      "businessProfile",
      "companyProfile",
    ]) ||
    (meta.businessProfile && typeof meta.businessProfile === "object"
      ? asTrimmedString(JSON.stringify(meta.businessProfile), 1_500)
      : "") ||
    asTrimmedString(knowledge?.plannerContext.similarProjects, 800);

  const visionRaw = meta.visionAnalysis ?? meta.visionResult ?? meta.vision;
  const visionSummary =
    typeof visionRaw === "string"
      ? asTrimmedString(visionRaw, 1_500)
      : visionRaw && typeof visionRaw === "object"
        ? asTrimmedString(JSON.stringify(visionRaw), 1_500)
        : "";

  const userSettingsSummary =
    readNestedString(meta, ["userSettingsSummary", "userSettings", "atlasMemory"]) ||
    (meta.userProfile && typeof meta.userProfile === "object"
      ? asTrimmedString(JSON.stringify(meta.userProfile), 1_000)
      : "");

  const pastDeliverableHints = [
    knowledge?.workerContext,
    knowledge?.plannerContext.preferredFormats,
    knowledge?.plannerContext.successfulStrategies,
    knowledge?.qaMistakesToAvoid
      ? `避けるべき点:\n${knowledge.qaMistakesToAvoid}`
      : "",
  ]
    .filter((v): v is string => Boolean(v?.trim()))
    .join("\n\n")
    .slice(0, 2_000);

  const templateId = resolveCompanyTemplateIdFromMetadata(meta);
  const templateHints =
    readNestedString(meta, ["templateHints", "deliverableTemplate"]) ||
    asTrimmedString(knowledge?.plannerContext.preferredFormats, 600);

  const knowledgePack = mergeKnowledgeForWriter({
    promptKind,
    metadata: meta,
    knowledge,
    reference,
    businessProfileSummary,
    visionSummary,
    userSettingsSummary,
    pastDeliverableHints,
    templateId,
    templateHints,
  });

  return {
    businessProfileSummary,
    visionSummary,
    userSettingsSummary,
    pastDeliverableHints,
    templateId,
    templateHints,
    reference,
    promptKind,
    knowledgePack,
    knowledgeUsage: knowledgePack.usage,
  };
}

/** Compact block injected into Writer / Reviewer contexts. */
export function formatContextPackForPrompt(pack: QualityContextPack): string {
  const merged = formatMergedKnowledgeForPrompt(pack.knowledgePack, 4_500);
  if (merged) return merged;

  // Fallback if merge produced empty (should be rare — registry always has rules).
  const lines = [
    pack.businessProfileSummary
      ? `Business Profile:\n${pack.businessProfileSummary}`
      : "",
    pack.visionSummary
      ? `Vision解析（矛盾する記述は禁止）:\n${pack.visionSummary}`
      : "",
    pack.userSettingsSummary
      ? `ユーザー設定:\n${pack.userSettingsSummary}`
      : "",
    pack.templateHints ? `テンプレート指針:\n${pack.templateHints}` : "",
    pack.pastDeliverableHints
      ? `過去成果物の参考（コピー禁止・品質参考のみ）:\n${pack.pastDeliverableHints}`
      : "",
    pack.reference.summary ? pack.reference.summary : "",
  ].filter(Boolean);

  return lines.join("\n\n").slice(0, 4_000);
}
