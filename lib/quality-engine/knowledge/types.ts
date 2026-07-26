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
  | "past_deliverables";

export type KnowledgeEntry = {
  id: string;
  layer: KnowledgeLayerId;
  title: string;
  body: string;
  /** Optional deliverable kinds this entry applies to (empty = all). */
  kinds?: readonly QualityPromptKind[];
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
  /** Flattened prompt text (priority-merged). */
  mergedText: string;
  usage: KnowledgeUsage;
};
