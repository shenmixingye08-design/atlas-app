import { COMPACT_DELIVERABLE_JSON } from "@/lib/prompts/workflow/compact-prompts";
import type { WorkTask } from "@/lib/agents/tasks/types";

import { formatContextPackForPrompt, type QualityContextPack } from "./context-pack";
import { formatSectionsForPrompt } from "./sections";
import { getSpecialistProfile } from "./specialists";
import type { QualityPromptKind, WriterBrief } from "./types";
import { formatWriterBriefForPrompt } from "./writer-brief";

/** Dedicated Writer prompt — specialist AI + section-structured generation. */
export function buildSectionedWriterPrompt(input: {
  kind: QualityPromptKind;
  tasks: readonly WorkTask[];
  brief: WriterBrief;
  contextPack: QualityContextPack;
}): string {
  const specialist = getSpecialistProfile(input.kind);
  const taskList = input.tasks
    .map((t) => `${t.id}. ${t.title}: ${t.description}`)
    .join("\n");

  return [
    `Specialist: ${specialist.label}`,
    specialist.writerInstructions,
    `Priorities:\n${specialist.writerPriorities.map((p) => `- ${p}`).join("\n")}`,
    `Layout:\n${specialist.layoutHints}`,
    formatWriterBriefForPrompt(input.brief),
    formatContextPackForPrompt(input.contextPack),
    `Generate SECTION BY SECTION in this order:\n${formatSectionsForPrompt(input.kind)}`,
    `Tasks:\n${taskList || "(unified deliverable)"}`,
    "Rules:",
    "- Do not invent facts that contradict Business Profile or Vision.",
    "- Past deliverables and attachments are reference only — never copy verbatim.",
    "- Fill markdown with ## headings matching each section title.",
    "- Also include sections:[{id,title,content}] in the JSON when possible.",
    COMPACT_DELIVERABLE_JSON.replace(
      "Return ONLY valid JSON:",
      "Return ONLY valid JSON (include optional sections[]):",
    ),
  ].join("\n\n");
}

/** Specialist Reviewer prompt — checklist differs per deliverable kind. */
export function buildQualityReviewerPrompt(input: {
  kind: QualityPromptKind;
  markdown: string;
  brief: WriterBrief;
  contextPack: QualityContextPack;
}): string {
  const specialist = getSpecialistProfile(input.kind);
  return [
    `You are the ${specialist.label} Reviewer (do not rewrite the whole document).`,
    `Focus: ${specialist.judgeFocus}`,
    "Checklist:",
    ...specialist.reviewerChecks.map((c) => `- ${c}`),
    "Also check: typos, consistency, Business Profile fit, Vision/reference fit, natural Japanese, missing info, duplication.",
    formatWriterBriefForPrompt(input.brief),
    formatContextPackForPrompt(input.contextPack),
    `Deliverable:\n${input.markdown.slice(0, 4_500)}`,
    'Return ONLY JSON: {"approved":boolean,"issues":string[],"feedback":string}',
  ].join("\n\n");
}

/** Specialist Quality Judge prompt — criteria weights described via focus. */
export function buildQualityJudgePrompt(input: {
  kind: QualityPromptKind;
  markdown: string;
}): string {
  const specialist = getSpecialistProfile(input.kind);
  return [
    `You are the ${specialist.label} Quality Judge.`,
    `Primary focus: ${specialist.judgeFocus}`,
    "Score 0-100 for each criterion and overall (weight the focus higher).",
    "Criteria: completeness, readability, persuasiveness, naturalness, expertise, design, structure, information.",
    `Priorities to emphasize:\n${specialist.writerPriorities.map((p) => `- ${p}`).join("\n")}`,
    `Deliverable:\n${input.markdown.slice(0, 4_500)}`,
    'Return ONLY JSON: {"overallScore":number,"criteria":{"completeness":n,"readability":n,"persuasiveness":n,"naturalness":n,"expertise":n,"design":n,"structure":n,"information":n},"feedback":string,"weakSections":string[]}',
  ].join("\n\n");
}

export function buildQualityImprovePrompt(input: {
  kind: QualityPromptKind;
  feedback: string;
  weakSections: readonly string[];
}): string {
  const specialist = getSpecialistProfile(input.kind);
  return [
    `Specialist: ${specialist.label}`,
    specialist.writerInstructions,
    `Focus: ${specialist.judgeFocus}`,
    `Layout: ${specialist.layoutHints}`,
    "Improve the COMPLETE deliverable JSON based on Judge/Reviewer feedback.",
    `Weak sections: ${input.weakSections.join(", ") || "(general)"}`,
    `Feedback:\n${input.feedback.slice(0, 2_000)}`,
    "Keep Business Profile / Vision / reference consistency. No fabricated facts. Never copy attachments.",
    "Regenerate section-by-section headings in markdown.",
    COMPACT_DELIVERABLE_JSON,
  ].join("\n\n");
}

/** Planner prompt addendum — organize only, never write the deliverable body. */
export function buildPlannerQualityAddendum(kind: QualityPromptKind): string {
  const specialist = getSpecialistProfile(kind);
  return [
    "Planner rules: do NOT write the final deliverable body.",
    `Organize for ${specialist.label}: purpose, audience, tone, page structure, required sections, profile/vision/reference notes.`,
    `Focus: ${specialist.judgeFocus}`,
    "Return JSON including plan + tasks only.",
  ].join(" ");
}
