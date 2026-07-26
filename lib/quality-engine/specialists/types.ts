import type { QualityJudgeCriteria, QualityPromptKind } from "../types";

/** Owner/internal label for the specialist AI (never shown to end users). */
export type SpecialistProfile = {
  kind: QualityPromptKind;
  /** Internal name e.g. 営業資料AI */
  label: string;
  /** Primary quality focus for Judge feedback (営業力 / SEO / …). */
  judgeFocus: string;
  /** Weighted overall score — missing keys default to 1. */
  judgeWeights: Readonly<Partial<Record<keyof QualityJudgeCriteria, number>>>;
  /** Writer priorities injected into prompts. */
  writerPriorities: readonly string[];
  /** Specialist Reviewer checklist. */
  reviewerChecks: readonly string[];
  /** Core writer instruction block. */
  writerInstructions: string;
  /** Layout / format hints (Word・Excel・PDF etc.). */
  layoutHints: string;
};
