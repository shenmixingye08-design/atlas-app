/**
 * Phase 1: Natural language → durable automation create.
 * Parse/detect is client-safe; persistence lives in .server.ts.
 */

import { formatUserDateTime } from "@/lib/automations/ux";
import { detectRecurringIntent } from "./detect-recurring";
import {
  detectRequiredExternalActions,
  type RequiredExternalAction,
} from "./detect-external-intent";
import type { CreateAutomationInput } from "./types";
import { buildXDestinationExecutionFlow } from "./x-recurring/destination";

export type NaturalLanguageAutomationParse =
  | {
      ok: true;
      createInput: CreateAutomationInput;
      frequency: "daily" | "weekly" | "monthly";
      sourceText: string;
      requiredExternals: RequiredExternalAction[];
    }
  | {
      ok: false;
      code: "empty" | "not_recurring";
      message: string;
    };

/** Parse NL into CreateAutomationInput. Does not persist. */
export function parseNaturalLanguageAutomation(
  text: string,
): NaturalLanguageAutomationParse {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      ok: false,
      code: "empty",
      message: "依頼文が空です。",
    };
  }

  const detected = detectRecurringIntent(trimmed);
  if (!detected.detected) {
    return {
      ok: false,
      code: "not_recurring",
      message: "定期の依頼として認識できませんでした。",
    };
  }

  const requiredExternals = detectRequiredExternalActions(trimmed);
  const createInput: CreateAutomationInput = {
    ...detected.createInput,
    enabled: true,
    executionLevel: detected.createInput.executionLevel ?? "approve_then_run",
    ...(requiredExternals.includes("x_post")
      ? {
          destination: "x" as const,
          executionFlow: buildXDestinationExecutionFlow(
            detected.createInput.executionLevel ?? "approve_then_run",
          ),
        }
      : {}),
  };

  if (createInput.schedule.kind !== "schedule") {
    return {
      ok: false,
      code: "not_recurring",
      message: "スケジュール付きの定期依頼として認識できませんでした。",
    };
  }

  return {
    ok: true,
    createInput,
    frequency: createInput.schedule.preset.type,
    sourceText: trimmed,
    requiredExternals,
  };
}

/**
 * V2 external create is Calendar (etc.) only.
 * X-only NL must stay on V1 destination=x — V2 cannot wire `x_post`
 * (`canWireProductionExternalStep` is calendar-only) and would fail-closed
 * after the user asked to register a recurring X post.
 */
export function shouldRouteNlToV2ExternalCreate(
  requiredExternals: readonly RequiredExternalAction[],
): boolean {
  return requiredExternals.some((action) => action !== "x_post");
}

export function formatNaturalLanguageAutomationSuccess(input: {
  name: string;
  scheduleLabel: string;
  nextRun: string | null;
  executionLevel: string;
  timezone: string;
  appliedPreferenceLabels?: readonly string[];
  nextRunLabel?: string;
  actionLabel?: string;
  approvalLabel?: string;
}): string {
  const looksInstant = Boolean(
    input.nextRun && (/T/.test(input.nextRun) || /Z$/.test(input.nextRun)),
  );
  const next = input.nextRunLabel
    ? `次回：${input.nextRunLabel}`
    : looksInstant && input.nextRun
      ? `次回：${formatUserDateTime(input.nextRun, { timeZone: input.timezone })}`
      : input.nextRun != null
        ? `次回：${input.nextRun}`
        : "次回：実行待ち";
  const action = input.actionLabel ?? input.name;
  const approval = input.approvalLabel ?? "実行前に確認";
  const lines = [
    "自動化しました",
    `${input.scheduleLabel}に${action}します。`,
    next,
    `実行方法：${approval}`,
  ];
  if (input.appliedPreferenceLabels && input.appliedPreferenceLabels.length > 0) {
    lines.push(`あなたの好みを反映：${input.appliedPreferenceLabels.join("、")}`);
  }
  return lines.join("\n");
}
