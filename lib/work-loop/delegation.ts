/**
 * VALUE 13 — reuse existing AutomationExecutionLevel. No second permission model.
 *
 * LEVEL 1 提案のみ           → suggest_only
 * LEVEL 2 生成まで／送信前確認 → draft_save | approve_then_run
 * LEVEL 3 許可範囲で実行まで   → full_auto
 */

import type { AutomationExecutionLevel } from "@/lib/automations/types";

import { kindHasExternalSideEffect, type WorkKind } from "./kinds";

export type DelegationLevel = 1 | 2 | 3;

export const DELEGATION_LABELS: Record<DelegationLevel, string> = {
  1: "提案のみ",
  2: "生成まで自動。外部送信前に確認",
  3: "許可した範囲で実行まで自動",
};

export function toDelegationLevel(level: AutomationExecutionLevel): DelegationLevel {
  if (level === "suggest_only") return 1;
  if (level === "full_auto") return 3;
  return 2;
}

export function fromDelegationLevel(
  level: DelegationLevel,
  kind: WorkKind,
): AutomationExecutionLevel {
  if (level === 1) return "suggest_only";
  if (level === 3) return "full_auto";
  if (kind === "gmail_draft" || kind === "wordpress_draft") return "draft_save";
  return "approve_then_run";
}

export function mayAutoSend(input: {
  executionLevel: AutomationExecutionLevel;
  kind: WorkKind;
}): boolean {
  if (!kindHasExternalSideEffect(input.kind)) return false;
  if (input.kind === "gmail_draft") {
    return input.executionLevel === "full_auto";
  }
  return input.executionLevel === "full_auto";
}

export function shouldAskApprovalEveryRun(input: {
  executionLevel: AutomationExecutionLevel;
  succeeded: boolean;
}): boolean {
  if (!input.succeeded) return true;
  return input.executionLevel !== "full_auto";
}

export function countHumanInterventions(input: {
  executionLevel: AutomationExecutionLevel;
  runStatus: "succeeded" | "failed" | "awaiting_approval" | "needs_input";
  exception?: boolean;
  permissionsOk?: boolean;
}): { count: number; reason: "approval_required" | "exception" | "needs_input" | "none" } {
  if (input.exception || input.runStatus === "failed" || input.permissionsOk === false) {
    return { count: 1, reason: "exception" };
  }
  if (input.runStatus === "needs_input") {
    return { count: 1, reason: "needs_input" };
  }
  if (input.executionLevel !== "full_auto" || input.runStatus === "awaiting_approval") {
    return { count: 1, reason: "approval_required" };
  }
  return { count: 0, reason: "none" };
}
