import { estimateTokens } from "@/lib/ai/cost-meter";

import type { QualityPromptKind } from "../types";
import type {
  KnowledgeEntry,
  KnowledgeEntryMeta,
  KnowledgeLayerId,
  NormalizedKnowledgeEntry,
} from "./types";

const LAYER_CATEGORY: Record<KnowledgeLayerId, string> = {
  business_profile: "business_profile",
  reference: "reference",
  company: "company",
  industry: "industry",
  deliverable: "deliverable",
  template: "template",
  brand: "brand",
  rules: "rules",
  design: "design",
  vision: "vision",
  user_settings: "user_settings",
  past_deliverables: "past_deliverables",
  user_instruction: "user_instruction",
};

const EPOCH = "1970-01-01T00:00:00.000Z";

/** Safe defaults for legacy Knowledge entries missing metadata. */
export function normalizeKnowledgeEntry(
  entry: KnowledgeEntry,
  nowIso = new Date().toISOString(),
): NormalizedKnowledgeEntry {
  const artifactTypes = entry.meta?.artifactTypes?.length
    ? entry.meta.artifactTypes
    : entry.kinds ?? [];
  const body = entry.body ?? "";
  const estimatedTokens =
    typeof entry.meta?.estimatedTokens === "number" &&
    Number.isFinite(entry.meta.estimatedTokens)
      ? Math.max(0, Math.round(entry.meta.estimatedTokens))
      : estimateTokens(body);

  const alwaysRequiredLayers: KnowledgeLayerId[] = [
    "user_instruction",
    "business_profile",
  ];
  const required =
    entry.meta?.required === true ||
    alwaysRequiredLayers.includes(entry.layer) ||
    (entry.layer === "rules" &&
      /禁止|法務|安全|コンプライアンス|必須/i.test(`${entry.title}\n${body}`)) ||
    /禁止表現|法務ルール|コンプライアンス/i.test(`${entry.title}\n${body}`);

  const meta: KnowledgeEntryMeta = {
    category: entry.meta?.category ?? LAYER_CATEGORY[entry.layer] ?? "general",
    subcategory: entry.meta?.subcategory ?? entry.layer,
    artifactTypes,
    tags: entry.meta?.tags ?? [],
    priority:
      typeof entry.meta?.priority === "number" ? entry.meta.priority : required ? 90 : 50,
    confidence:
      typeof entry.meta?.confidence === "number" ? entry.meta.confidence : 70,
    required,
    sourceType: entry.meta?.sourceType ?? "registry",
    sourceId: entry.meta?.sourceId ?? entry.id,
    createdAt: entry.meta?.createdAt ?? EPOCH,
    updatedAt: entry.meta?.updatedAt ?? nowIso,
    expiresAt: entry.meta?.expiresAt ?? null,
    version: typeof entry.meta?.version === "number" ? entry.meta.version : 1,
    estimatedTokens,
    enabled: entry.meta?.enabled !== false,
    locale: entry.meta?.locale ?? "ja",
  };

  return {
    ...entry,
    kinds: entry.kinds ?? (artifactTypes as QualityPromptKind[]),
    body,
    meta,
  };
}
