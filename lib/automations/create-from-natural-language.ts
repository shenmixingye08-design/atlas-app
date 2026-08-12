/**
 * Phase 1: Natural language → durable automation create.
 * Parse/detect is client-safe; persistence lives in .server.ts.
 */

import { detectRecurringIntent } from "./detect-recurring";
import {
  detectRequiredExternalActions,
  type RequiredExternalAction,
} from "./detect-external-intent";
import type { CreateAutomationInput } from "./types";

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

  const createInput: CreateAutomationInput = {
    ...detected.createInput,
    enabled: true,
    executionLevel: detected.createInput.executionLevel ?? "approve_then_run",
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
    requiredExternals: detectRequiredExternalActions(trimmed),
  };
}

export function formatNaturalLanguageAutomationSuccess(input: {
  name: string;
  scheduleLabel: string;
  nextRun: string | null;
  executionLevel: string;
  timezone: string;
}): string {
  const next =
    input.nextRun != null
      ? `次回実行: ${input.nextRun}`
      : "次回実行: （未設定 — 登録に失敗した可能性があります）";
  return [
    `定期の仕事「${input.name}」を登録しました。`,
    `スケジュール: ${input.scheduleLabel}（${input.timezone}）`,
    `実行範囲: ${input.executionLevel}`,
    next,
    "Minute Scheduler の次回判定対象になります。",
  ].join("\n");
}
