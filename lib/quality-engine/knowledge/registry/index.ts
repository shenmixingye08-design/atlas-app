import type { QualityPromptKind } from "../../types";
import type { KnowledgeEntry } from "../types";

import { BLOG_KNOWLEDGE } from "./blog";
import { BRAND_KNOWLEDGE } from "./brand";
import { COMPANY_KNOWLEDGE } from "./company";
import { CONTRACT_KNOWLEDGE } from "./contract";
import { DESIGN_KNOWLEDGE } from "./design";
import { EXCEL_KNOWLEDGE } from "./excel";
import { INDUSTRY_KNOWLEDGE } from "./industry";
import { PDF_KNOWLEDGE } from "./pdf";
import { RULES_KNOWLEDGE } from "./rules";
import { SALES_KNOWLEDGE } from "./sales";
import { WORD_KNOWLEDGE } from "./word";

const ALL_STATIC: readonly KnowledgeEntry[] = [
  ...COMPANY_KNOWLEDGE,
  ...BRAND_KNOWLEDGE,
  ...RULES_KNOWLEDGE,
  ...DESIGN_KNOWLEDGE,
  ...INDUSTRY_KNOWLEDGE,
  ...SALES_KNOWLEDGE,
  ...BLOG_KNOWLEDGE,
  ...CONTRACT_KNOWLEDGE,
  ...EXCEL_KNOWLEDGE,
  ...PDF_KNOWLEDGE,
  ...WORD_KNOWLEDGE,
];

function appliesToKind(
  entry: KnowledgeEntry,
  kind: QualityPromptKind,
): boolean {
  if (!entry.kinds || entry.kinds.length === 0) return true;
  return entry.kinds.includes(kind);
}

/** Registry lookup — static deliverable / brand / company / rules / design knowledge. */
export function listRegistryKnowledge(
  kind: QualityPromptKind,
): readonly KnowledgeEntry[] {
  return ALL_STATIC.filter((entry) => appliesToKind(entry, kind));
}

export {
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
};
