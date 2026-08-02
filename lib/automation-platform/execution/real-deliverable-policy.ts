/**
 * Policy for V2 real deliverable generation.
 *
 * Default ON — stub "success" with url:null is forbidden for paid retention.
 * Rollback: ATLAS_V2_REAL_DELIVERABLES=false (fails closed, never fake-succeeds).
 */

import type { DeliverableFormat } from "@/lib/deliverables/types";
import type { AutomationCapabilityId } from "@/lib/automation-platform/types/step";
import { WORD_CONTENT_MIN_CHARS } from "@/lib/deliverables/constants";

export function isV2RealDeliverablesEnabled(): boolean {
  const raw = process.env.ATLAS_V2_REAL_DELIVERABLES?.trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return true;
}

const STEP_FORMATS: Partial<Record<AutomationCapabilityId, DeliverableFormat[]>> =
  {
    word_generate: ["docx", "pdf"],
    excel_generate: ["xlsx", "pdf"],
    pdf_generate: ["pdf"],
    powerpoint_generate: ["pptx", "pdf"],
    deliverable_generate: ["docx", "pdf"],
  };

export function formatsForDeliverableStep(
  stepType: AutomationCapabilityId,
): DeliverableFormat[] | null {
  return STEP_FORMATS[stepType] ?? null;
}

export function isDeliverableGenerateStep(
  stepType: AutomationCapabilityId,
): boolean {
  return formatsForDeliverableStep(stepType) !== null;
}

export type DeliverableSourceInput = {
  automationName: string;
  assignmentNotes?: string | null;
  stepName: string;
  stepType: AutomationCapabilityId;
  configuration: Record<string, unknown>;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Build exportable source text from automation instruction + step config.
 * No AI call — keeps cost low for Light (¥980) weekly report path.
 */
export function buildDeliverableSourceContent(
  input: DeliverableSourceInput,
): { content: string; title: string; assignment: string } {
  const title =
    asTrimmedString(input.configuration.title) ||
    input.stepName.trim() ||
    input.automationName.trim() ||
    "成果物";

  const documentType = asTrimmedString(input.configuration.documentType);
  const tone = asTrimmedString(input.configuration.tone);
  const sheetPlan = asTrimmedString(input.configuration.sheetPlan);
  const notes = asTrimmedString(input.assignmentNotes);
  const bodyHint =
    asTrimmedString(input.configuration.body) ||
    asTrimmedString(input.configuration.content) ||
    asTrimmedString(input.configuration.assignment) ||
    notes;

  const sections: string[] = [];
  sections.push(`# ${title}`);
  sections.push("");
  sections.push(`作成日: ${new Date().toISOString().slice(0, 10)}`);
  if (documentType) sections.push(`文書種別: ${documentType}`);
  if (tone) sections.push(`文体: ${tone}`);
  sections.push("");
  sections.push("## 概要");
  sections.push(
    bodyHint ||
      `${input.automationName} の定期成果物です。以下の内容をもとに整理しました。`,
  );
  sections.push("");
  sections.push("## 詳細");
  if (bodyHint) {
    sections.push(bodyHint);
  } else {
    sections.push(
      "依頼内容の要点を整理し、確認しやすい形でまとめました。追加の修正点があればお申し付けください。",
    );
  }
  if (sheetPlan) {
    sections.push("");
    sections.push("## 表・シート構成");
    sections.push(sheetPlan);
  }
  sections.push("");
  sections.push("## 次のアクション");
  sections.push(
    "内容をご確認のうえ、必要であれば修正指示をお願いいたします。",
  );

  let content = sections.join("\n").trim();
  if (content.length < WORD_CONTENT_MIN_CHARS) {
    content = `${content}\n\n補足: ${input.automationName}（${input.stepName}）の成果物として保存します。`;
  }

  const assignmentParts = [
    input.automationName,
    title,
    documentType,
    bodyHint.slice(0, 200),
  ].filter(Boolean);

  return {
    content,
    title,
    assignment: assignmentParts.join(" / "),
  };
}
