/**
 * VALUE 11 — convert a successful job into an existing Automation.
 * Dates and one-shot wording are not frozen into the standing work.
 */

import { checkAutomationTaskLimit, checkFeatureAccess } from "@/lib/billing/plans";
import type { PlanId } from "@/lib/billing/plans/types";
import { createAutomationFromInput } from "@/lib/automations/domain";
import {
  buildCreateInputFromForm,
  defaultAutomationFormState,
  syncExecutionFlowFromJobText,
} from "@/lib/automations/form-utils";
import type { Automation, AutomationExecutionLevel, CreateAutomationInput } from "@/lib/automations/types";

import {
  classifyWorkKind,
  isAutomatableKind,
  kindHasExternalSideEffect,
  kindNeedsBlog,
  kindNeedsGoogle,
  kindNeedsX,
  stripVolatileTokens,
  workFingerprint,
  type AutomatableKind,
  type WorkKind,
} from "./kinds";
import type { SuccessfulJob } from "./repeat-detection";

export type ConvertSchedule = {
  frequency: "daily" | "weekly" | "monthly";
  hour: number;
  minute: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
};

export type ConvertWorkResult =
  | {
      ok: true;
      createInput: CreateAutomationInput;
      automation: Automation;
      fingerprint: string;
      nextRunAt: string | null;
    }
  | { ok: false; reason: string; code: "unsupported" | "entitlement" | "invalid" };

function defaultExecutionLevel(kind: WorkKind): AutomationExecutionLevel {
  if (kind === "gmail_draft" || kind === "wordpress_draft") return "draft_save";
  if (kindHasExternalSideEffect(kind)) return "approve_then_run";
  return "full_auto";
}

function destinationFor(kind: WorkKind): "x" | "none" {
  return kind === "x_post" ? "x" : "none";
}

function standingAssignment(kind: AutomatableKind, assignment: string): string {
  const stripped = stripVolatileTokens(assignment).replace(/今日|きょう|本日|今すぐ/g, "").trim();
  if (kind === "x_post") return stripped || "Xに投稿する";
  if (kind === "gmail_draft") return stripped || "定型メールの下書きを作る";
  if (kind === "calendar_create") return stripped || "予定を登録する";
  if (kind === "wordpress_draft") return stripped || "WordPressの下書きを作る";
  if (kind === "excel") return stripped || "Excelを作る";
  if (kind === "pdf") return stripped || "PDFを作る";
  if (kind === "pptx") return stripped || "スライドを作る";
  return stripped || "報告書を作る";
}

export function assertConvertEntitlement(input: {
  kind: WorkKind;
  planId: PlanId;
  currentAutomationCount: number;
}): { allowed: true } | { allowed: false; reason: string } {
  const slot = checkAutomationTaskLimit(input.planId, input.currentAutomationCount);
  if (!slot.allowed) {
    return { allowed: false, reason: slot.reason ?? "自動化の上限です" };
  }
  if (kindNeedsX(input.kind) && !checkFeatureAccess(input.planId, "sns_auto_post").allowed) {
    return { allowed: false, reason: "このプランではX自動投稿は利用できません" };
  }
  if (kindNeedsGoogle(input.kind) && !checkFeatureAccess(input.planId, "google_integration").allowed) {
    return { allowed: false, reason: "このプランではGoogle連携は利用できません" };
  }
  if (kindNeedsBlog(input.kind) && !checkFeatureAccess(input.planId, "blog_creation").allowed) {
    return { allowed: false, reason: "このプランではブログ作成は利用できません" };
  }
  return { allowed: true };
}

export function buildWorkCreateInput(input: {
  job: SuccessfulJob;
  schedule: ConvertSchedule;
  executionLevel?: AutomationExecutionLevel;
  userId?: string;
}): ConvertWorkResult {
  const kind = classifyWorkKind({
    assignment: input.job.assignment,
    title: input.job.title,
    deliverableType: input.job.deliverableFormat,
    services: input.job.services,
  });
  if (!isAutomatableKind(kind) || input.job.status !== "completed") {
    return { ok: false, reason: "この仕事はまだAutomationにできません", code: "unsupported" };
  }

  const assignment = standingAssignment(kind, input.job.assignment);
  const executionLevel = input.executionLevel ?? defaultExecutionLevel(kind);
  const form = syncExecutionFlowFromJobText(
    defaultAutomationFormState({
      title: input.job.title.trim() || assignment,
      assignment,
      description: `${input.job.title} — 成功した依頼から登録`,
      destination: destinationFor(kind),
      frequency: input.schedule.frequency,
      hour: input.schedule.hour,
      minute: input.schedule.minute,
      dayOfWeek: input.schedule.dayOfWeek ?? 5,
      dayOfMonth: input.schedule.dayOfMonth ?? 1,
      executionLevel,
      enabled: true,
    }),
  );
  const createInput = buildCreateInputFromForm(form);
  const automation = createAutomationFromInput({
    ...createInput,
    userId: input.userId ?? input.job.userId,
  });

  return {
    ok: true,
    createInput: { ...createInput, userId: automation.userId },
    automation,
    fingerprint: workFingerprint({
      kind,
      assignment: input.job.assignment,
      deliverableFormat: input.job.deliverableFormat,
    }),
    nextRunAt: automation.nextRun,
  };
}

export function convertSuccessfulJobToWork(input: {
  job: SuccessfulJob;
  schedule: ConvertSchedule;
  executionLevel?: AutomationExecutionLevel;
  planId: PlanId;
  currentAutomationCount: number;
  userId?: string;
}): ConvertWorkResult {
  const kind = classifyWorkKind({
    assignment: input.job.assignment,
    title: input.job.title,
    deliverableType: input.job.deliverableFormat,
    services: input.job.services,
  });
  const entitlement = assertConvertEntitlement({
    kind,
    planId: input.planId,
    currentAutomationCount: input.currentAutomationCount,
  });
  if (!entitlement.allowed) {
    return { ok: false, reason: entitlement.reason, code: "entitlement" };
  }
  return buildWorkCreateInput(input);
}

export function workNeedsReinstruction(automation: Pick<Automation, "enabled" | "nextRun">): boolean {
  return !(automation.enabled && Boolean(automation.nextRun));
}
