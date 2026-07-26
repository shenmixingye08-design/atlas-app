export type {
  KnowledgeLayerId,
  KnowledgeEntry,
  KnowledgeEntryMeta,
  NormalizedKnowledgeEntry,
  KnowledgeUsageFlags,
  KnowledgeUsage,
  MergedKnowledgePack,
} from "./types";

export { normalizeKnowledgeEntry } from "./normalize";

export {
  KNOWLEDGE_MERGE_PRIORITY,
  collectKnowledgeCandidates,
  mergeKnowledgeForWriter,
  buildKnowledgeUsage,
  formatMergedKnowledgeForPrompt,
  buildMergedTextFromEntries,
} from "./merge";

export {
  listRegistryKnowledge,
  BLOG_KNOWLEDGE,
  BRAND_KNOWLEDGE,
  COMPANY_KNOWLEDGE,
  CONTRACT_KNOWLEDGE,
  DESIGN_KNOWLEDGE,
  EXCEL_KNOWLEDGE,
  INDUSTRY_KNOWLEDGE,
  PDF_KNOWLEDGE,
  RULES_KNOWLEDGE,
  SALES_KNOWLEDGE,
  WORD_KNOWLEDGE,
} from "./registry";
