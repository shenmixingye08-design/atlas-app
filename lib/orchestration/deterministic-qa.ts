import type { Deliverable, DeliverableType } from "@/lib/orchestration/deliverable-types";
import type { QualityCriterionScores } from "@/lib/orchestration/parse-quality";
import { QUALITY_PASS_THRESHOLD } from "@/lib/orchestration/parse-quality";
import { detectEmailSubject } from "@/lib/orchestration/email-deliverable";
import { validateDeliverableFields } from "@/lib/orchestration/deliverable-validation";

export type DeterministicQaResult = {
  overallScore: number;
  criteria: QualityCriterionScores;
  passed: boolean;
  feedback: string;
  failedChecks: string[];
};

const MIN_CONTENT_LENGTH: Record<DeliverableType, number> = {
  blog: 400,
  report: 300,
  proposal: 300,
  presentation: 200,
  research: 300,
  email: 100,
  social_post: 50,
  short_document: 80,
  document: 200,
};

function hasHeading(markdown: string): boolean {
  return /^#{1,3}\s/m.test(markdown) || markdown.includes("\n## ");
}

function isValidMarkdown(text: string): boolean {
  if (!text.trim()) return false;
  if (text.includes("undefined") || text.includes("[object Object]")) return false;
  return true;
}

function scoreCriterion(passed: boolean, partial = false): number {
  if (passed) return 100;
  if (partial) return 60;
  return 0;
}

/** Rule-based QA — no LLM. */
export function runDeterministicQa(deliverable: Deliverable): DeterministicQaResult {
  if (deliverable.type === "email") {
    return runEmailDeterministicQa(deliverable);
  }

  if (deliverable.type === "social_post" || deliverable.type === "short_document") {
    return runCoreTypeDeterministicQa(deliverable);
  }

  const failedChecks: string[] = [];
  const type = deliverable.type;
  const content = deliverable.content.trim();
  const markdown = deliverable.markdown.trim();
  const body = content || markdown;

  if (!deliverable.title.trim()) failedChecks.push("title missing");
  if (!deliverable.summary.trim()) failedChecks.push("summary missing");
  if (!body) failedChecks.push("empty deliverable body");
  if (body.length < (MIN_CONTENT_LENGTH[type] ?? 200)) {
    failedChecks.push(`content below minimum length (${MIN_CONTENT_LENGTH[type]})`);
  }
  if (!hasHeading(markdown || content)) {
    failedChecks.push("headings missing");
  }
  if (!isValidMarkdown(markdown || content)) failedChecks.push("invalid markdown");

  if (type === "blog") {
    if (!deliverable.metadata.seo.title.trim()) failedChecks.push("SEO title missing");
    if (!deliverable.metadata.seo.description.trim()) {
      failedChecks.push("SEO description missing");
    }
    if (deliverable.metadata.tags.length === 0) failedChecks.push("tags missing");
    if (!deliverable.metadata.snsPost.trim()) failedChecks.push("SNS post missing");
  }

  const accuracy = scoreCriterion(body.length > 0 && deliverable.title.length > 0);
  const completeness = scoreCriterion(failedChecks.length === 0, failedChecks.length <= 2);
  const logic = scoreCriterion(Boolean(deliverable.summary));
  const readability = scoreCriterion(hasHeading(markdown || content));
  const professionalism = scoreCriterion(isValidMarkdown(markdown || content));
  const visualStructure = scoreCriterion(
    type !== "blog" || deliverable.metadata.tags.length > 0,
    type === "blog",
  );

  const criteria: QualityCriterionScores = {
    accuracy,
    completeness,
    logic,
    readability,
    professionalism,
    visualStructure,
  };

  const values = Object.values(criteria);
  const overallScore = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const passed = overallScore >= QUALITY_PASS_THRESHOLD && failedChecks.length === 0;

  const feedback = passed
    ? "Deterministic QA passed all required checks."
    : `Deterministic QA found issues: ${failedChecks.join("; ")}`;

  return { overallScore, criteria, passed, feedback, failedChecks };
}

const EMAIL_QA_PASS_THRESHOLD = 85;

function runEmailDeterministicQa(deliverable: Deliverable): DeterministicQaResult {
  const validation = validateDeliverableFields(deliverable);
  const failedChecks = validation.issues.map((issue) => `${issue.field}: ${issue.reason}`);
  const body = deliverable.content.trim() || deliverable.markdown.trim();

  if (body.length < MIN_CONTENT_LENGTH.email) {
    failedChecks.push(`content below minimum length (${MIN_CONTENT_LENGTH.email})`);
  }

  const subject = detectEmailSubject(deliverable);
  if (!subject.trim()) {
    failedChecks.push("metadata.subject missing");
  }

  const criteria: QualityCriterionScores = {
    accuracy: 100,
    completeness: failedChecks.length === 0 ? 100 : 70,
    logic: deliverable.title.trim() ? 100 : 60,
    readability: body.length > 50 ? 100 : 60,
    professionalism: 100,
    visualStructure: 100,
  };

  const values = Object.values(criteria);
  const overallScore = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const passed =
    validation.valid &&
    failedChecks.length === 0 &&
    overallScore >= EMAIL_QA_PASS_THRESHOLD;

  const feedback = passed
    ? "Email deliverable passed required checks."
    : `Email QA found issues: ${failedChecks.join("; ")}`;

  return { overallScore, criteria, passed, feedback, failedChecks };
}

function runCoreTypeDeterministicQa(deliverable: Deliverable): DeterministicQaResult {
  const failedChecks: string[] = [];
  const type = deliverable.type;

  if (type === "social_post") {
    const posts = deliverable.metadata.posts?.filter((p) => p.trim()) ?? [];
    if (posts.length < 3) failedChecks.push("posts below minimum (3)");
    if (posts.length > 5) failedChecks.push("posts above maximum (5)");
  }

  if (type === "short_document") {
    if (!deliverable.title.trim()) failedChecks.push("title missing");
    if (!deliverable.content.trim()) failedChecks.push("content missing");
  }

  const criteria: QualityCriterionScores = {
    accuracy: 100,
    completeness: failedChecks.length === 0 ? 100 : 60,
    logic: 100,
    readability: 100,
    professionalism: 100,
    visualStructure: 100,
  };

  const values = Object.values(criteria);
  const overallScore = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const passed = failedChecks.length === 0 && overallScore >= QUALITY_PASS_THRESHOLD;

  return {
    overallScore,
    criteria,
    passed,
    feedback: passed
      ? "Core deliverable passed required checks."
      : `Core QA found issues: ${failedChecks.join("; ")}`,
    failedChecks,
  };
}
