/**
 * VALUE 9 — Work is a projection of existing Automation.
 * No competing Job model.
 */

import type { Automation, AutomationExecutionLevel } from "@/lib/automations/types";
import { resolveAutomationUserStatus } from "@/lib/automations/ux";

export type WorkLifecycle =
  | "active"
  | "paused"
  | "needs_attention"
  | "completed"
  | "failed";

export type WorkAsset = {
  id: string;
  userId: string | null;
  name: string;
  kind: string;
  lifecycle: WorkLifecycle;
  lastSuccessAt: string | null;
  nextRunAt: string | null;
  mode: "auto" | "confirm";
  integrations: string[];
  deliverableFormat: string | null;
  rules: string[];
  recentExecutionIds: string[];
  href: string;
};

export function lifecycleFromAutomation(automation: Automation): WorkLifecycle {
  const status = resolveAutomationUserStatus(automation);
  if (status === "paused") return "paused";
  if (status === "failed") return "failed";
  if (status === "needs_attention" || status === "awaiting_approval") {
    return "needs_attention";
  }
  if (!automation.enabled && automation.status === "success") return "completed";
  return "active";
}

export function modeFromLevel(level: AutomationExecutionLevel): "auto" | "confirm" {
  return level === "full_auto" ? "auto" : "confirm";
}

export function detectWorkKind(automation: Automation): string {
  if (automation.destination === "x") return "x_post";
  const text = `${automation.name} ${automation.workflow.assignment}`;
  if (/excel|家計簿|xlsx/i.test(text)) return "excel";
  if (/週報|報告書|word|docx/i.test(text)) return "report";
  if (/calendar|予定/i.test(text)) return "calendar";
  if (/gmail|メール/i.test(text)) return "gmail";
  if (/wordpress|ブログ/i.test(text)) return "wordpress";
  return "automation";
}

export function toWorkAsset(automation: Automation): WorkAsset {
  const lastSuccess =
    automation.runHistory.find((row) => row.status === "completed")?.completedAt ??
    (automation.status === "success" ? automation.lastRun : null);
  return {
    id: automation.id,
    userId: automation.userId,
    name: automation.name,
    kind: detectWorkKind(automation),
    lifecycle: lifecycleFromAutomation(automation),
    lastSuccessAt: lastSuccess,
    nextRunAt: automation.enabled ? automation.nextRun : null,
    mode: modeFromLevel(automation.executionLevel),
    integrations: automation.destination === "x" ? ["x"] : [],
    deliverableFormat: /word|docx/i.test(automation.workflow.assignment)
      ? "docx"
      : /excel|xlsx/i.test(automation.workflow.assignment)
        ? "xlsx"
        : /pdf/i.test(automation.workflow.assignment)
          ? "pdf"
          : null,
    rules: [],
    recentExecutionIds: automation.runHistory.map((row) => row.id),
    href: `/automations?id=${encodeURIComponent(automation.id)}`,
  };
}

export function listWorkAssets(
  automations: readonly Automation[],
  userId: string,
): WorkAsset[] {
  return automations
    .filter((automation) => automation.userId === userId)
    .map(toWorkAsset);
}

export function workCounts(works: readonly WorkAsset[]): {
  entrusted: number;
  needsAttention: number;
} {
  return {
    entrusted: works.filter(
      (work) => work.lifecycle === "active" || work.lifecycle === "paused",
    ).length,
    needsAttention: works.filter((work) => work.lifecycle === "needs_attention").length,
  };
}
