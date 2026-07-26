import { resolveCompanyTemplateIdFromMetadata } from "@/lib/company-templates/context";
import type { KnowledgeRetrievalResult } from "@/lib/knowledge/types";

import {
  buildSmartContextTelemetry,
  selectSmartContext,
  toMergedKnowledgePack,
  type SmartContextTelemetry,
} from "./context";
import {
  collectKnowledgeCandidates,
  formatMergedKnowledgeForPrompt,
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
  /** Knowledge Engine merged pack for Writer (Smart Context selected). */
  knowledgePack: MergedKnowledgePack;
  /** Owner/telemetry usage flags. */
  knowledgeUsage: KnowledgeUsage;
  /** Smart Context Engine selection telemetry (owner-only). */
  smartContext: SmartContextTelemetry;
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

function readScopeIds(meta: Record<string, unknown>): {
  userId: string;
  organizationId: string | null;
} {
  const userId =
    (typeof meta.userId === "string" && meta.userId) ||
    (typeof meta.progressUserId === "string" && meta.progressUserId) ||
    "";
  const organizationId =
    (typeof meta.organizationId === "string" && meta.organizationId) ||
    (typeof meta.orgId === "string" && meta.orgId) ||
    null;
  return { userId, organizationId };
}

/**
 * Assemble Writer Context Pack via Knowledge Engine + Smart Context (no LLM).
 * Collects candidates, then selects/compresses within token budget.
 */
export function buildQualityContextPack(input: {
  assignment?: string;
  deliverableType?: string;
  metadata?: Readonly<Record<string, unknown>> | null;
  knowledge?: KnowledgeRetrievalResult | null;
  promptKind?: QualityPromptKind;
  /** Force-include knowledge ids (info-gap refill). */
  forceIncludeIds?: readonly string[];
  bypassCache?: boolean;
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

  const assignment = input.assignment ?? "";
  const candidates = collectKnowledgeCandidates({
    promptKind,
    assignment,
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

  const { userId, organizationId } = readScopeIds(meta);
  const language =
    typeof meta.locale === "string"
      ? meta.locale
      : typeof meta.language === "string"
        ? meta.language
        : "ja";

  const selection = selectSmartContext({
    candidates,
    promptKind,
    assignment,
    userId,
    organizationId,
    language,
    forceIncludeIds: input.forceIncludeIds,
    bypassCache: input.bypassCache || Boolean(input.forceIncludeIds?.length),
  });

  const knowledgePack = toMergedKnowledgePack(selection, {
    businessProfile: Boolean(businessProfileSummary.trim()),
    reference: reference.hasReferences,
    template: Boolean(templateHints.trim() || templateId),
    vision: Boolean(visionSummary.trim()),
    pastDeliverables: Boolean(pastDeliverableHints.trim()),
    userSettings: Boolean(userSettingsSummary.trim()),
  });

  const smartContext = buildSmartContextTelemetry({
    stats: selection.stats,
    scored: selection.scored,
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
    smartContext,
  };
}

/** Compact block injected into Writer / Reviewer contexts. */
export function formatContextPackForPrompt(pack: QualityContextPack): string {
  const maxChars = Math.max(
    2_000,
    Math.min(48_000, (pack.smartContext?.budgetTokens ?? 6_000) * 4),
  );
  const merged = formatMergedKnowledgeForPrompt(pack.knowledgePack, maxChars);
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

  return lines.join("\n\n").slice(0, maxChars);
}
