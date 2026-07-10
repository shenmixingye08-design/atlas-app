import type { WorkTask } from "@/lib/agents/tasks/types";
import {
  CEO_APPROVAL_EXCELLENCE,
  QA_EXCELLENCE,
  WORKER_EXCELLENCE,
} from "@/lib/prompts/excellence/output-standards";

/**
 * Workflow task prompts — Quality Assurance pipeline step (post-Reviewer).
 */

export function buildQualityAssuranceTaskPrompt(
  assignment: string,
  deliverable: string,
  revisionNumber: number,
  mistakesToAvoid?: string,
): string {
  return [
    QA_EXCELLENCE,
    ``,
    `You are the Quality Assurance department. Score the combined deliverable before it reaches the user.`,
    ``,
    `Original assignment:`,
    assignment,
    ``,
    `Deliverable to evaluate (revision ${revisionNumber}):`,
    deliverable,
    ...(mistakesToAvoid?.trim()
      ? [
          ``,
          `Previous mistakes from company knowledge — verify these have been avoided:`,
          mistakesToAvoid,
        ]
      : []),
    ``,
    `Score each dimension 0–100 (consulting-grade bar — 95+ means client-ready):`,
    `- accuracy — factual correctness, no hallucinated data or unsupported claims`,
    `- completeness — business value delivered; full assignment coverage; user usefulness`,
    `- logic — sound reasoning, coherent flow, execution quality`,
    `- readability — clarity, scannability, appropriate structure`,
    `- professionalism — consulting-grade tone, professional appearance`,
    `- visualStructure — headings, lists, tables, hierarchy (100 if not applicable)`,
    ``,
    `Pass threshold: 95. If overall score is below 95, you MUST list specific, actionable fixes mapped to Task IDs.`,
    ``,
    `Respond with a JSON block first, then structured human-readable feedback:`,
    "```json",
    "{",
    '  "overallScore": 0,',
    '  "criteria": {',
    '    "accuracy": 0,',
    '    "completeness": 0,',
    '    "logic": 0,',
    '    "readability": 0,',
    '    "professionalism": 0,',
    '    "visualStructure": 0',
    "  },",
    '  "tasksNeedingRevision": [1],',
    '  "feedback": "Structured improvement notes"',
    "}",
    "```",
    ``,
    `After the JSON, include these markdown sections:`,
    `## Strengths`,
    `## Gaps (business value, usefulness, clarity, appearance, execution)`,
    `## Revisions Required`,
    `(Bullet list: Task ID → specific change → expected outcome)`,
  ].join("\n");
}

export function buildCeoApprovalTaskPrompt(
  assignment: string,
  deliverable: string,
  qualityScore: number,
  qualityFeedback: string,
): string {
  return [
    CEO_APPROVAL_EXCELLENCE,
    ``,
    `You are the CEO performing final approval before the deliverable is released to the user.`,
    ``,
    `Original assignment:`,
    assignment,
    ``,
    `Quality Assurance overall score: ${qualityScore}/100`,
    ``,
    `QA summary:`,
    qualityFeedback,
    ``,
    `Deliverable candidate:`,
    deliverable,
    ``,
    `Decision criteria:`,
    `- APPROVE only if you would send this to a paying client without embarrassment`,
    `- REJECT if generic, repetitive, incomplete, inconsistent, or below consulting standards`,
    `- A QA score ≥95 is necessary but NOT sufficient — apply your own executive judgment`,
    ``,
    `If APPROVED: respond with "Verdict: APPROVED" then the polished, client-ready final text.`,
    `(Tighten prose, fix formatting, ensure executive summary and recommendations are sharp.)`,
    ``,
    `If NOT ready: respond with "Verdict: NEEDS_REVISION" and executive guidance for QA and Workers.`,
    `(Be specific about what must change and why.)`,
  ].join("\n");
}

export function buildWorkerRevisionTaskPrompt(
  task: WorkTask,
  qualityFeedback: string,
): string {
  return [
    buildWorkerRevisionIntro(task, qualityFeedback),
    ``,
    WORKER_EXCELLENCE,
    ``,
    `Produce a revised deliverable addressing every QA issue with specific changes — not a change log.`,
    `Output the improved work product in full.`,
  ].join("\n");
}

function buildWorkerRevisionIntro(task: WorkTask, qualityFeedback: string): string {
  return [
    `Revise your previous output for this task based on Quality Assurance feedback.`,
    ``,
    `Task ${task.id}: ${task.title}`,
    task.description,
    ``,
    `Quality Assurance feedback (address every item):`,
    qualityFeedback,
  ].join("\n");
}
