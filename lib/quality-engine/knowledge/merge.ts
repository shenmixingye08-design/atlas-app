import type { KnowledgeRetrievalResult } from "@/lib/knowledge/types";

import type { ReferenceInsights } from "../reference-engine";
import type { QualityPromptKind } from "../types";
import { listRegistryKnowledge } from "./registry";
import type {
  KnowledgeEntry,
  KnowledgeLayerId,
  KnowledgeUsage,
  MergedKnowledgePack,
} from "./types";

/** Merge priority for Writer Context Pack (first = highest). */
export const KNOWLEDGE_MERGE_PRIORITY: readonly KnowledgeLayerId[] = [
  "business_profile",
  "reference",
  "company",
  "industry",
  "deliverable",
  "template",
  "brand",
  "rules",
  "design",
  "vision",
  "user_settings",
  "past_deliverables",
] as const;

const LAYER_TITLE: Record<KnowledgeLayerId, string> = {
  business_profile: "会社概要 / Business Profile",
  reference: "参考資料 (Reference Engine)",
  company: "会社Knowledge",
  industry: "業界Knowledge",
  deliverable: "成果物Knowledge",
  template: "Template",
  brand: "ブランド情報",
  rules: "文章ルール",
  design: "デザインルール",
  vision: "Vision解析",
  user_settings: "ユーザー設定",
  past_deliverables: "過去成果物",
};

function trim(text: string, max: number): string {
  const t = text.trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}\n[...truncated]` : t;
}

function asString(value: unknown, max = 1_200): string {
  if (typeof value !== "string") return "";
  return trim(value, max);
}

function pushEntry(
  bucket: KnowledgeEntry[],
  entry: KnowledgeEntry,
): void {
  if (!entry.body.trim()) return;
  bucket.push({
    ...entry,
    body: trim(entry.body, 1_800),
  });
}

/**
 * Collect runtime + registry knowledge, then merge in priority order
 * into a Writer-ready Context Pack payload.
 */
export function mergeKnowledgeForWriter(input: {
  promptKind: QualityPromptKind;
  metadata?: Readonly<Record<string, unknown>> | null;
  knowledge?: KnowledgeRetrievalResult | null;
  reference: ReferenceInsights;
  businessProfileSummary: string;
  visionSummary: string;
  userSettingsSummary: string;
  pastDeliverableHints: string;
  templateId: string | null;
  templateHints: string;
  maxMergedChars?: number;
}): MergedKnowledgePack {
  const meta = (input.metadata ?? {}) as Record<string, unknown>;
  const entries: KnowledgeEntry[] = [];

  // --- Runtime layers (highest priority sources) ---
  if (input.businessProfileSummary.trim()) {
    pushEntry(entries, {
      id: "runtime.business_profile",
      layer: "business_profile",
      title: "Business Profile / 会社・サービス",
      body: [
        input.businessProfileSummary,
        asString(meta.serviceInfo, 600),
        asString(meta.brandInfo, 600),
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  if (input.reference.hasReferences && input.reference.summary.trim()) {
    pushEntry(entries, {
      id: "runtime.reference",
      layer: "reference",
      title: "Reference Engine",
      body: input.reference.summary,
    });
  }

  const companyExtra =
    asString(meta.companyKnowledge, 1_200) ||
    asString(meta.companyKnowledgeBase, 1_200);
  if (companyExtra) {
    pushEntry(entries, {
      id: "runtime.company",
      layer: "company",
      title: "会社独自ナレッジ",
      body: companyExtra,
    });
  }

  const industryExtra = asString(meta.industryKnowledge, 1_000);
  if (industryExtra) {
    pushEntry(entries, {
      id: "runtime.industry",
      layer: "industry",
      title: "業界ナレッジ（指定）",
      body: industryExtra,
    });
  }

  if (input.templateHints.trim() || input.templateId) {
    pushEntry(entries, {
      id: "runtime.template",
      layer: "template",
      title: "Template",
      body: [
        input.templateId ? `templateId: ${input.templateId}` : "",
        input.templateHints,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  if (input.visionSummary.trim()) {
    pushEntry(entries, {
      id: "runtime.vision",
      layer: "vision",
      title: "Vision",
      body: `${input.visionSummary}\n（Visionと矛盾する記述は禁止）`,
    });
  }

  if (input.userSettingsSummary.trim()) {
    pushEntry(entries, {
      id: "runtime.user_settings",
      layer: "user_settings",
      title: "ユーザー設定",
      body: input.userSettingsSummary,
    });
  }

  if (input.pastDeliverableHints.trim()) {
    pushEntry(entries, {
      id: "runtime.past",
      layer: "past_deliverables",
      title: "過去成果物",
      body: `${input.pastDeliverableHints}\n（コピー禁止・品質参考のみ）`,
    });
  }

  // Company knowledge retrieval snippets as company layer supplement
  const retrievalCompany = [
    input.knowledge?.plannerContext.similarProjects,
    input.knowledge?.plannerContext.successfulStrategies,
  ]
    .filter((v): v is string => Boolean(v?.trim()))
    .join("\n\n");
  if (retrievalCompany) {
    pushEntry(entries, {
      id: "runtime.retrieval_company",
      layer: "company",
      title: "会社ナレッジ（検索）",
      body: retrievalCompany,
    });
  }

  // --- Static registry ---
  for (const entry of listRegistryKnowledge(input.promptKind)) {
    pushEntry(entries, entry);
  }

  // Merge by priority
  const maxChars = input.maxMergedChars ?? 5_500;
  const sections: MergedKnowledgePack["sections"][number][] = [];
  const layersUsed: KnowledgeLayerId[] = [];
  let merged = "";

  for (const layer of KNOWLEDGE_MERGE_PRIORITY) {
    const layerEntries = entries.filter((e) => e.layer === layer);
    if (layerEntries.length === 0) continue;
    layersUsed.push(layer);
    const body = layerEntries
      .map((e) => `### ${e.title}\n${e.body}`)
      .join("\n\n");
    const title = LAYER_TITLE[layer];
    const chunk = `## ${title}\n${body}`;
    if (merged.length + chunk.length + 2 > maxChars) {
      const remain = maxChars - merged.length - 32;
      if (remain > 80) {
        sections.push({
          title,
          body: trim(body, remain),
          layer,
        });
        merged = `${merged}\n\n## ${title}\n${trim(body, remain)}`.trim();
      }
      break;
    }
    sections.push({ title, body, layer });
    merged = merged ? `${merged}\n\n${chunk}` : chunk;
  }

  const usage = buildKnowledgeUsage({
    layersUsed,
    entryCount: entries.length,
    contextChars: merged.length,
    businessProfile: Boolean(input.businessProfileSummary.trim()),
    reference: input.reference.hasReferences,
    template: Boolean(input.templateHints.trim() || input.templateId),
    vision: Boolean(input.visionSummary.trim()),
    pastDeliverables: Boolean(input.pastDeliverableHints.trim()),
    userSettings: Boolean(input.userSettingsSummary.trim()),
  });

  return {
    sections,
    mergedText: merged,
    usage,
  };
}

export function buildKnowledgeUsage(input: {
  layersUsed: readonly KnowledgeLayerId[];
  entryCount: number;
  contextChars: number;
  businessProfile: boolean;
  reference: boolean;
  template: boolean;
  vision: boolean;
  pastDeliverables: boolean;
  userSettings: boolean;
}): KnowledgeUsage {
  const set = new Set(input.layersUsed);
  return {
    businessProfile: input.businessProfile,
    reference: input.reference,
    template: input.template,
    knowledge: set.has("company") || set.has("industry") || set.has("deliverable"),
    vision: input.vision,
    pastDeliverables: input.pastDeliverables,
    userSettings: input.userSettings,
    company: set.has("company"),
    industry: set.has("industry"),
    deliverable: set.has("deliverable"),
    brand: set.has("brand"),
    rules: set.has("rules"),
    design: set.has("design"),
    contextChars: input.contextChars,
    layersUsed: input.layersUsed,
    entryCount: input.entryCount,
  };
}

export function formatMergedKnowledgeForPrompt(
  pack: MergedKnowledgePack,
  max = 4_500,
): string {
  if (!pack.mergedText.trim()) return "";
  return [
    "Knowledge Engine Context Pack（優先順位どおり統合済み）",
    "Business Profile → Reference → 会社 → 業界 → 成果物 → Template → …",
    trim(pack.mergedText, max),
  ].join("\n\n");
}
