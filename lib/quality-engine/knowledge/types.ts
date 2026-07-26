import type { QualityPromptKind } from "../types";

/** Knowledge layer priority (lower index = higher priority when merging). */
export type KnowledgeLayerId =
  | "business_profile"
  | "reference"
  | "company"
  | "industry"
  | "deliverable"
  | "template"
  | "brand"
  | "rules"
  | "design"
  | "vision"
  | "user_settings"
  | "past_deliverables"
  | "user_instruction";

export type KnowledgeSourceType =
  | "runtime"
  | "registry"
  | "retrieval"
  | "reference"
  | "template"
  | "user";

/** Full metadata for Smart Context scoring (optional on legacy entries). */
export type KnowledgeEntryMeta = {
  category: string;
  subcategory: string;
  artifactTypes: readonly QualityPromptKind[];
  tags: readonly string[];
  priority: number;
  confidence: number;
  required: boolean;
  sourceType: KnowledgeSourceType;
  sourceId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  version: number;
  estimatedTokens: number;
  enabled: boolean;
  locale: string;
};

export type KnowledgeEntry = {
  id: string;
  layer: KnowledgeLayerId;
  title: string;
  body: string;
  /** Optional deliverable kinds this entry applies to (empty = all). */
  kinds?: readonly QualityPromptKind[];
  /** Optional Smart Context metadata — normalized at collect time. */
  meta?: Partial<KnowledgeEntryMeta>;
};

export type NormalizedKnowledgeEntry = KnowledgeEntry & {
  meta: KnowledgeEntryMeta;
};

export type KnowledgeUsageFlags = {
  businessProfile: boolean;
  reference: boolean;
  template: boolean;
  knowledge: boolean;
  vision: boolean;
  pastDeliverables: boolean;
  userSettings: boolean;
  company: boolean;
  industry: boolean;
  deliverable: boolean;
  brand: boolean;
  rules: boolean;
  design: boolean;
};

/** Owner-facing Knowledge Engine usage snapshot. */
export type KnowledgeUsage = KnowledgeUsageFlags & {
  contextChars: number;
  layersUsed: readonly KnowledgeLayerId[];
  entryCount: number;
};

export type MergedKnowledgePack = {
  /** Ordered sections for Writer Context Pack. */
  sections: readonly { title: string; body: string; layer: KnowledgeLayerId }[];
  /** Flattened prompt text (priority-merged / smart-selected). */
  mergedText: string;
  usage: KnowledgeUsage;
  /** All candidates before Smart Context selection. */
  candidates: readonly NormalizedKnowledgeEntry[];
};
