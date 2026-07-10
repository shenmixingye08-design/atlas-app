import type { OrchestrationResult } from "@/lib/orchestration/types";
import type { CreateKnowledgeInput } from "@/lib/knowledge/types";
import { ui } from "@/lib/i18n";

import { generateCompanyLearning } from "./generate-learning";
import { confidenceToScore, type CompanyLearning, type LearningRecord } from "./types";

function preview(text: string, max = 400): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\u3040-\u30ff\u4e00-\u9faf-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function assignmentTokens(assignment: string): string[] {
  return assignment
    .toLowerCase()
    .split(/[\s、。,.;:!?()[\]{}'"\/\\|+\-]+/)
    .filter((token) => token.length >= 3)
    .slice(0, 6);
}

function buildLearningTags(
  record: LearningRecord,
  assignment: string,
): string[] {
  return [
    ...new Set([
      "learning",
      "company:atlas",
      `department:${record.departmentId}`,
      `topic:${record.topicId}`,
      `workflow:${slugify(record.workflow)}`,
      record.departmentId,
      record.topicId,
      ...assignmentTokens(assignment),
    ]),
  ];
}

function formatLearningContent(record: LearningRecord): string {
  const parts = [
    `${ui.learning.workedLabel}: ${record.workedWell}`,
    record.didNotWorkWell
      ? `${ui.learning.notWorkedLabel}: ${record.didNotWorkWell}`
      : null,
    `${ui.learning.recommendationLabel}: ${record.recommendation}`,
    `${ui.learning.departmentLabel}: ${record.department}`,
    `${ui.learning.workflowLabel}: ${record.workflow}`,
    `${ui.learning.topicLabel}: ${record.topic}`,
  ].filter(Boolean);

  return parts.join("\n");
}

export function companyLearningToKnowledgeInputs(
  learning: CompanyLearning,
  input: {
    workflowId: string;
    assignment: string;
  },
): CreateKnowledgeInput[] {
  return learning.records.map((record) => ({
    title: preview(record.recommendation, 80),
    category: "company_learning",
    tags: buildLearningTags(record, input.assignment),
    summary: record.recommendation,
    sourceWorkflowId: input.workflowId,
    reusable: true,
    confidence: confidenceToScore(record.confidence),
    content: formatLearningContent(record),
    assignmentHint: input.assignment,
  }));
}

/** Extract company learning knowledge entries for workflow ingest. */
export function extractCompanyLearningKnowledge(
  result: OrchestrationResult,
  input: { workflowId: string; assignment: string },
): CreateKnowledgeInput[] {
  const learning = generateCompanyLearning(result);
  if (!learning) return [];
  return companyLearningToKnowledgeInputs(learning, input);
}
