import type { KnowledgeRetrievalResult } from "@/lib/knowledge/types";

import type { ReferenceInsights } from "../reference-engine";
import type { QualityPromptKind } from "../types";
import { normalizeKnowledgeEntry } from "./normalize";
import { listRegistryKnowledge } from "./registry";
import type {
  KnowledgeEntry,
  KnowledgeLayerId,
  KnowledgeUsage,
  MergedKnowledgePack,
  NormalizedKnowledgeEntry,
} from "./types";

/** Merge priority for Writer Context Pack (first = highest). */
export const KNOWLEDGE_MERGE_PRIORITY: readonly KnowledgeLayerId[] = [
  "user_instruction",
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
  user_instruction: "ユーザー明示指示",
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

function pushEntry(bucket: KnowledgeEntry[], entry: KnowledgeEntry): void {
  if (!entry.body.trim()) return;
  bucket.push({
    ...entry,
    body: trim(entry.body, 2_400),
  });
}

export type CollectKnowledgeInput = {
  promptKind: QualityPromptKind;
  assignment?: string;
  metadata?: Readonly<Record<string, unknown>> | null;
  knowledge?: KnowledgeRetrievalResult | null;
  reference: ReferenceInsights;
  businessProfileSummary: string;
  visionSummary: string;
  userSettingsSummary: string;
  pastDeliverableHints: string;
  templateId: string | null;
  templateHints: string;
};

/** Collect all Knowledge candidates (no selection / no LLM). */
export function collectKnowledgeCandidates(
  input: CollectKnowledgeInput,
): NormalizedKnowledgeEntry[] {
  const meta = (input.metadata ?? {}) as Record<string, unknown>;
  const entries: KnowledgeEntry[] = [];
  const assignment = (input.assignment ?? "").trim();

  if (assignment) {
    pushEntry(entries, {
      id: "runtime.user_instruction",
      layer: "user_instruction",
      title: "今回のユーザー明示指示",
      body: assignment.slice(0, 1_500),
      meta: {
        required: true,
        priority: 100,
        confidence: 100,
        sourceType: "user",
        category: "user_instruction",
        tags: ["user", "required"],
      },
    });
  }

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
      meta: {
        required: true,
        priority: 95,
        sourceType: "runtime",
        tags: ["company", "brand", "required"],
      },
    });
  }

  if (input.reference.hasReferences && input.reference.summary.trim()) {
    const explicitRef = Boolean(meta.referenceSpecified || meta.forceReference);
    pushEntry(entries, {
      id: "runtime.reference",
      layer: "reference",
      title: "Reference Engine",
      body: input.reference.summary,
      meta: {
        required: explicitRef || input.reference.attachmentCount > 0,
        priority: explicitRef ? 92 : 75,
        sourceType: "reference",
        tags: ["reference", ...input.reference.kinds],
        confidence: 80,
      },
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
      meta: { sourceType: "runtime", priority: 70, tags: ["company"] },
    });
  }

  const industryExtra = asString(meta.industryKnowledge, 1_000);
  if (industryExtra) {
    pushEntry(entries, {
      id: "runtime.industry",
      layer: "industry",
      title: "業界ナレッジ（指定）",
      body: industryExtra,
      meta: { sourceType: "runtime", priority: 65, tags: ["industry"] },
    });
  }

  if (input.templateHints.trim() || input.templateId) {
    const forced = Boolean(meta.templateSpecified || meta.forceTemplate);
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
      meta: {
        required: forced || Boolean(input.templateId),
        priority: forced ? 90 : 68,
        sourceType: "template",
        tags: ["template"],
      },
    });
  }

  if (input.visionSummary.trim()) {
    pushEntry(entries, {
      id: "runtime.vision",
      layer: "vision",
      title: "Vision",
      body: `${input.visionSummary}\n（Visionと矛盾する記述は禁止）`,
      meta: { sourceType: "runtime", priority: 72, tags: ["vision"] },
    });
  }

  if (input.userSettingsSummary.trim()) {
    pushEntry(entries, {
      id: "runtime.user_settings",
      layer: "user_settings",
      title: "ユーザー設定",
      body: input.userSettingsSummary,
      meta: { sourceType: "runtime", priority: 60, tags: ["settings"] },
    });
  }

  if (input.pastDeliverableHints.trim()) {
    pushEntry(entries, {
      id: "runtime.past",
      layer: "past_deliverables",
      title: "過去成果物",
      body: `${input.pastDeliverableHints}\n（コピー禁止・品質参考のみ）`,
      meta: {
        sourceType: "retrieval",
        priority: 45,
        tags: ["past", input.promptKind],
        confidence: 60,
      },
    });
  }

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
      meta: { sourceType: "retrieval", priority: 55, tags: ["company", "past"] },
    });
  }

  for (const entry of listRegistryKnowledge(input.promptKind)) {
    pushEntry(entries, {
      ...entry,
      meta: {
        ...entry.meta,
        sourceType: "registry",
        artifactTypes: entry.kinds ?? [],
        tags: entry.meta?.tags ?? [entry.layer, ...(entry.kinds ?? [])],
      },
    });
  }

  // Brand forbidden expressions as required when present in registry
  return entries
    .filter((e) => e.body.trim())
    .map((e) => normalizeKnowledgeEntry(e));
}

/**
 * Collect + naive priority merge (Phase3 compat).
 * Smart Context Engine should select from `candidates` instead of using full merge.
 */
export function mergeKnowledgeForWriter(
  input: CollectKnowledgeInput & { maxMergedChars?: number },
): MergedKnowledgePack {
  const candidates = collectKnowledgeCandidates(input);
  const maxChars = input.maxMergedChars ?? 5_500;
  const sections: MergedKnowledgePack["sections"][number][] = [];
  const layersUsed: KnowledgeLayerId[] = [];
  let merged = "";

  for (const layer of KNOWLEDGE_MERGE_PRIORITY) {
    const layerEntries = candidates.filter((e) => e.layer === layer && e.meta.enabled);
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
        sections.push({ title, body: trim(body, remain), layer });
        merged = `${merged}\n\n## ${title}\n${trim(body, remain)}`.trim();
      }
      break;
    }
    sections.push({ title, body, layer });
    merged = merged ? `${merged}\n\n${chunk}` : chunk;
  }

  const usage = buildKnowledgeUsage({
    layersUsed,
    entryCount: candidates.length,
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
    candidates,
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
    "Knowledge Engine Context Pack（Smart Context選定済み）",
    "必須情報を保持しつつ、関連度の高い知識のみを渡しています。",
    trim(pack.mergedText, max),
  ].join("\n\n");
}

export function buildMergedTextFromEntries(
  selected: readonly NormalizedKnowledgeEntry[],
): { mergedText: string; sections: MergedKnowledgePack["sections"]; layersUsed: KnowledgeLayerId[] } {
  const sections: MergedKnowledgePack["sections"][number][] = [];
  const layersUsed: KnowledgeLayerId[] = [];
  const parts: string[] = [];

  for (const layer of KNOWLEDGE_MERGE_PRIORITY) {
    const layerEntries = selected.filter((e) => e.layer === layer);
    if (layerEntries.length === 0) continue;
    layersUsed.push(layer);
    const body = layerEntries.map((e) => `### ${e.title}\n${e.body}`).join("\n\n");
    const title = LAYER_TITLE[layer];
    sections.push({ title, body, layer });
    parts.push(`## ${title}\n${body}`);
  }

  return {
    mergedText: parts.join("\n\n"),
    sections,
    layersUsed,
  };
}
